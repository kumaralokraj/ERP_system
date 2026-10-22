import express from 'express';
import * as uniformController from '../../controllers/uniformController.js';
import adminAuth from '../../middlewares/adminAuth.js';
import { authorizePermissions } from '../../middleware/permissions.js';

const adminUniformRouter = express.Router();


// UNIFORM ITEMS
adminUniformRouter.get('/items', adminAuth, authorizePermissions('uniforms.view'), uniformController.getAllUniformItems);
adminUniformRouter.post('/items', adminAuth, authorizePermissions('uniforms.view'), uniformController.createUniformItem);
adminUniformRouter.put('/items/:id', adminAuth, authorizePermissions('uniforms.view'), uniformController.updateUniformItem);
adminUniformRouter.delete('/items/:id', adminAuth, authorizePermissions('uniforms.view'), uniformController.deleteUniformItem);

// LOW STOCK
adminUniformRouter.get('/items/low-stock', adminAuth, authorizePermissions('uniforms.view'), uniformController.getLowStockItems);

// STUDENT UNIFORMS
adminUniformRouter.get('/class/:classId', adminAuth, authorizePermissions('uniforms.view'), uniformController.getStudentUniformsByClass);
adminUniformRouter.get('/student/:studentId', adminAuth, authorizePermissions('uniforms.view'), uniformController.getStudentUniformDetails);
adminUniformRouter.post('/invoices', adminAuth, authorizePermissions('uniforms.view'), uniformController.issueUniformToStudent);
adminUniformRouter.post('/invoices/:invoiceId/payments', adminAuth, authorizePermissions('uniforms.view'), uniformController.recordUniformInvoicePayment);
adminUniformRouter.post('/issue', adminAuth, authorizePermissions('uniforms.view'), uniformController.issueUniformToStudent);
adminUniformRouter.put('/condition', adminAuth, authorizePermissions('uniforms.view'), uniformController.updateUniformCondition);

// CLASS STATISTICS 
adminUniformRouter.get('/stats/class/:classId', adminAuth, authorizePermissions('uniforms.view'), uniformController.getClassUniformStats);
adminUniformRouter.get('/stats/all-classes', adminAuth, authorizePermissions('uniforms.view'), uniformController.getAllClassesUniformSummary);

// INVENTORY
adminUniformRouter.get('/inventory/history', adminAuth, authorizePermissions('uniforms.view'), uniformController.getInventoryHistory);
adminUniformRouter.post('/inventory/add', adminAuth, authorizePermissions('uniforms.view'), uniformController.addInventory);

//  REPORTS 
adminUniformRouter.get('/reports/summary', adminAuth, authorizePermissions('uniforms.view'), uniformController.getUniformReport);

export default adminUniformRouter;
