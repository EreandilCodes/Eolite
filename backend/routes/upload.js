import express from 'express';
const router = express.Router();
// This route is deprecated. Use /api/gallery/upload for all uploads.
router.post('/', (_req, res) => {
  res.status(410).json({ error: 'Tento endpoint je zastaralý. Použijte /api/gallery/upload.' });
});
export default router;
