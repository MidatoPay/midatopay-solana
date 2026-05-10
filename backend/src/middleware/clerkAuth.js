/**
 * Alias histórico: antes intentaba Clerk + JWT. Solo JWT (authenticateToken).
 */
const { authenticateToken } = require('./auth');

module.exports = {
  authenticateHybrid: authenticateToken,
};
