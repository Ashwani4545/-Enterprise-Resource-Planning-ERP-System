// server/routes/aiRoutes.js

const express = require("express");
const router = express.Router();
const { getReorderSuggestion, getStockAnomalies } = require("../controllers/aiController");
const { verifyToken } = require("../middleware/auth");
const { checkRole } = require("../middleware/roleCheck");

// Any logged-in user can view reorder suggestions
router.get("/reorder-suggestion/:productId", verifyToken, getReorderSuggestion);

// Anomaly review is restricted the same way inventory writes are
router.get("/anomalies", verifyToken, checkRole(["super_admin", "inventory_manager"]), getStockAnomalies);

module.exports = router;

// In server.js, mount with:
//   const aiRoutes = require("./routes/aiRoutes");
//   app.use("/api/ai", aiRoutes);
