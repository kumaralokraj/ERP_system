import adminLogin from "../../controllers/adminLogin.js";
import express from 'express';
import { body } from 'express-validator';

const adminLoginRouter = express.Router();

adminLoginRouter.post(
	'/adminLogin',
	[
		body('email').isEmail().withMessage('Valid email is required'),
		body('password').notEmpty().withMessage('Password is required'),
		body('role').optional().isIn(['admin', 'manager', 'staff']).withMessage('Invalid role selected'),
	],
	adminLogin
);

export default adminLoginRouter;