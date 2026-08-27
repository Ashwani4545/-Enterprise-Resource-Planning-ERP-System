"""
ERP AI Insights Service
------------------------
A small Flask microservice that adds two ML-powered capabilities on top of
the ERP System's Inventory module:

1. /forecast/reorder   -> predicts near-term demand for a product and returns
                          a recommended reorder point + reorder quantity.
2. /anomaly/detect     -> scores a batch of stock adjustments and flags
                          statistically unusual ones (large swings, off-hours
                          activity, deviation from a product's normal pattern).

Design notes
------------
- Kept dependency-light (pandas + scikit-learn only) so it's easy to deploy
  alongside the existing Node/Express + PostgreSQL stack as a sidecar service.
- Both endpoints accept raw historical records in the request body so the
  Node backend stays the single source of truth for data (this service is
  stateless — it does not talk to Postgres directly).
- The forecasting model uses a simple linear-trend + moving-average blend
  rather than a heavier library (Prophet/ARIMA) to keep cold-start and
  install time low; swap in a heavier model later if forecast accuracy
  needs it.
"""

from flask import Flask, request, jsonify
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression
from datetime import datetime

app = Flask(__name__)


# ---------------------------------------------------------------------------
# 1. Demand forecasting / smart reorder recommendations
# ---------------------------------------------------------------------------

@app.route("/forecast/reorder", methods=["POST"])
def forecast_reorder():
    """
    Request body:
    {
      "product_id": 123,
      "lead_time_days": 7,          // days between placing a PO and receiving stock
      "safety_stock": 10,           // buffer to keep beyond predicted demand
      "current_stock": 45,
      "history": [
        {"date": "2026-07-01", "quantity_used": 12},
        {"date": "2026-07-02", "quantity_used": 9},
        ...
      ]
    }

    Response:
    {
      "product_id": 123,
      "predicted_daily_demand": 8.4,
      "predicted_demand_over_lead_time": 58.8,
      "recommended_reorder_point": 68.8,
      "recommended_reorder_quantity": 33.8,
      "should_reorder_now": false
    }
    """
    data = request.get_json(force=True)
    history = data.get("history", [])
    lead_time_days = data.get("lead_time_days", 7)
    safety_stock = data.get("safety_stock", 0)
    current_stock = data.get("current_stock", 0)
    product_id = data.get("product_id")

    if len(history) < 3:
        return jsonify({
            "error": "Need at least 3 days of history to forecast. "
                     "Falling back to average-based estimate is not possible with so little data."
        }), 400

    df = pd.DataFrame(history)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date")
    df["day_index"] = np.arange(len(df))

    # Blend a linear trend with a recent moving average so a single spike
    # day doesn't dominate the forecast, but a genuine trend still shows up.
    X = df[["day_index"]].values
    y = df["quantity_used"].values

    model = LinearRegression()
    model.fit(X, y)
    next_index = np.array([[len(df)]])
    trend_estimate = max(model.predict(next_index)[0], 0)

    recent_window = df["quantity_used"].tail(min(7, len(df)))
    moving_avg_estimate = recent_window.mean()

    predicted_daily_demand = float(round((trend_estimate + moving_avg_estimate) / 2, 2))
    predicted_demand_over_lead_time = round(predicted_daily_demand * lead_time_days, 2)
    recommended_reorder_point = round(predicted_demand_over_lead_time + safety_stock, 2)
    recommended_reorder_quantity = round(max(recommended_reorder_point - current_stock, 0), 2)

    return jsonify({
        "product_id": product_id,
        "predicted_daily_demand": predicted_daily_demand,
        "predicted_demand_over_lead_time": predicted_demand_over_lead_time,
        "recommended_reorder_point": recommended_reorder_point,
        "recommended_reorder_quantity": recommended_reorder_quantity,
        "should_reorder_now": current_stock <= recommended_reorder_point
    })


# ---------------------------------------------------------------------------
# 2. Anomaly detection on stock adjustments
# ---------------------------------------------------------------------------

@app.route("/anomaly/detect", methods=["POST"])
def detect_anomalies():
    """
    Request body:
    {
      "adjustments": [
        {
          "id": 501,
          "product_id": 123,
          "quantity_change": -80,
          "adjusted_by": 7,
          "timestamp": "2026-08-20T23:47:00"
        },
        ...
      ]
    }

    Response:
    {
      "flagged": [
        {"id": 501, "anomaly_score": 0.71, "reasons": ["large_magnitude", "off_hours"]}
      ],
      "total_checked": 40
    }
    """
    data = request.get_json(force=True)
    adjustments = data.get("adjustments", [])

    if len(adjustments) < 10:
        return jsonify({
            "error": "Need at least 10 adjustment records for a meaningful anomaly model."
        }), 400

    df = pd.DataFrame(adjustments)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df["hour"] = df["timestamp"].dt.hour
    df["abs_quantity_change"] = df["quantity_change"].abs()

    # Per-product z-score of the adjustment size, so a "large" adjustment is
    # judged relative to that product's own normal adjustment pattern, not
    # a single global threshold.
    df["product_mean"] = df.groupby("product_id")["quantity_change"].transform("mean")
    df["product_std"] = df.groupby("product_id")["quantity_change"].transform("std").replace(0, 1).fillna(1)
    df["z_score"] = (df["quantity_change"] - df["product_mean"]) / df["product_std"]

    features = df[["abs_quantity_change", "hour", "z_score"]].fillna(0)

    model = IsolationForest(contamination=0.1, random_state=42)
    df["anomaly_score_raw"] = model.fit_predict(features)
    df["anomaly_score"] = -model.decision_function(features)  # higher = more anomalous

    flagged = df[df["anomaly_score_raw"] == -1].copy()

    def reasons_for(row):
        reasons = []
        if abs(row["z_score"]) > 2:
            reasons.append("unusual_magnitude_for_product")
        if row["hour"] < 6 or row["hour"] > 22:
            reasons.append("off_hours")
        if row["abs_quantity_change"] > df["abs_quantity_change"].quantile(0.95):
            reasons.append("large_magnitude")
        return reasons or ["statistical_outlier"]

    flagged["reasons"] = flagged.apply(reasons_for, axis=1)

    result = [
        {
            "id": row.get("id"),
            "anomaly_score": round(float(row["anomaly_score"]), 3),
            "reasons": row["reasons"]
        }
        for _, row in flagged.iterrows()
    ]
    result.sort(key=lambda r: r["anomaly_score"], reverse=True)

    return jsonify({"flagged": result, "total_checked": len(df)})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "erp-ai-insights", "time": datetime.utcnow().isoformat()})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6000, debug=True)
