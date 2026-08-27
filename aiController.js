// server/controllers/aiController.js
//
// Bridges the existing Inventory module to the Python AI Insights service.
// Pulls real history from Postgres, forwards it to the ML service, and
// returns the result to the frontend — the ML service itself never touches
// the database directly.

const axios = require("axios");
const pool = require("../config/db");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:6000";

// GET /api/ai/reorder-suggestion/:productId
exports.getReorderSuggestion = async (req, res) => {
  const { productId } = req.params;
  const leadTimeDays = Number(req.query.leadTimeDays) || 7;
  const safetyStock = Number(req.query.safetyStock) || 0;

  try {
    // Daily usage history, derived from negative stock_audit entries
    // (i.e. stock going OUT). Adjust the query to match your actual
    // audit table/column names.
    const historyResult = await pool.query(
      `SELECT date_trunc('day', created_at) AS date,
              SUM(ABS(quantity_change)) AS quantity_used
       FROM stock_audit
       WHERE product_id = $1 AND quantity_change < 0
       GROUP BY date_trunc('day', created_at)
       ORDER BY date ASC
       LIMIT 90`,
      [productId]
    );

    const stockResult = await pool.query(
      `SELECT current_stock FROM products WHERE id = $1`,
      [productId]
    );

    if (stockResult.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const history = historyResult.rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      quantity_used: Number(r.quantity_used)
    }));

    const { data } = await axios.post(`${AI_SERVICE_URL}/forecast/reorder`, {
      product_id: productId,
      lead_time_days: leadTimeDays,
      safety_stock: safetyStock,
      current_stock: stockResult.rows[0].current_stock,
      history
    });

    res.json(data);
  } catch (err) {
    console.error("AI reorder suggestion failed:", err.message);
    res.status(502).json({ message: "AI service unavailable or returned an error" });
  }
};

// GET /api/ai/anomalies?days=7
exports.getStockAnomalies = async (req, res) => {
  const days = Number(req.query.days) || 7;

  try {
    const adjustmentsResult = await pool.query(
      `SELECT id, product_id, quantity_change, adjusted_by, created_at AS timestamp
       FROM stock_audit
       WHERE created_at >= NOW() - ($1 || ' days')::interval
       ORDER BY created_at ASC`,
      [days]
    );

    const adjustments = adjustmentsResult.rows.map((r) => ({
      id: r.id,
      product_id: r.product_id,
      quantity_change: r.quantity_change,
      adjusted_by: r.adjusted_by,
      timestamp: r.timestamp.toISOString()
    }));

    if (adjustments.length < 10) {
      return res.json({ flagged: [], total_checked: adjustments.length, note: "Not enough recent data to run anomaly detection." });
    }

    const { data } = await axios.post(`${AI_SERVICE_URL}/anomaly/detect`, { adjustments });

    res.json(data);
  } catch (err) {
    console.error("AI anomaly detection failed:", err.message);
    res.status(502).json({ message: "AI service unavailable or returned an error" });
  }
};
