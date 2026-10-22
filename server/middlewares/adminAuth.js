import { authenticateUser } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/permissions.js';

const adminPanelRoleGuard = authorizeRoles('admin', 'manager', 'staff');

const isHtmlNavigationRequest = (req) => {
  const acceptHeader = req.headers.accept || '';
  const hasBearerToken = (req.headers.authorization || '').startsWith('Bearer ');
  const hasHeaderToken = !!req.headers.token;

  return req.method === 'GET' && acceptHeader.includes('text/html') && !hasBearerToken && !hasHeaderToken;
};

const adminAuth = async (req, res, next) => {
  if (isHtmlNavigationRequest(req)) {
    return next('route');
  }

  return authenticateUser(req, res, () => adminPanelRoleGuard(req, res, next));
};

export default adminAuth;