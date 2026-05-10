const express = require('express');

const router = express.Router();

// Clerk fue retirado; mantener ruta para que integraciones antiguas no fallen con 404 duro.
router.post('/clerk', (_req, res) => {
  res.status(410).json({
    error: 'Gone',
    message: 'La integración con Clerk fue desactivada. Usá registro e inicio de sesión con email y contraseña.',
  });
});

module.exports = router;
