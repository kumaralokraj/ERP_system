import express from 'express';
import adminAuth from '../../middlewares/adminAuth.js';
import { authorizePermissions } from '../../middleware/permissions.js';
import {
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
  getLoginHistory,
} from '../../controllers/adminProfileController.js';

const adminProfileRouter = express.Router();

adminProfileRouter.get('/profile', adminAuth, authorizePermissions('profile.view'), getAdminProfile);
adminProfileRouter.put('/profile', adminAuth, authorizePermissions('profile.view'), updateAdminProfile);
adminProfileRouter.put('/change-password', adminAuth, authorizePermissions('profile.view'), changeAdminPassword);
adminProfileRouter.get('/login-history', adminAuth, authorizePermissions('profile.view'), getLoginHistory);

export default adminProfileRouter;
