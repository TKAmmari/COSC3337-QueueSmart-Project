// Checks who is making the request. The front end sends the token it got at
// login in a header: "Authorization: Bearer <token>".
const ApiError = require('../utils/ApiError');
const { getUserByToken } = require('../modules/auth');

function requireLogin(req, res, next) {
  const token = (req.get('Authorization') || '').replace('Bearer ', '');
  const user = getUserByToken(token);
  if (!user) return next(new ApiError(401, 'Please sign in to continue.'));
  req.user = user;
  req.token = token;
  next();
}

// Use after requireLogin, e.g. router.post('/', requireLogin, requireRole('admin'), ...)
function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return next(new ApiError(403, role === 'admin' ? 'Only advisors can do that.' : 'Only students can do that.'));
    }
    next();
  };
}

module.exports = { requireLogin, requireRole };
