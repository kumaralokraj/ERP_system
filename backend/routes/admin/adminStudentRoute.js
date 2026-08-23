import express from 'express';
import { getAllStudents , getStudentsByClassName , createStudent ,updateStudent,deleteStudent,getStudentById,getAllFeesRecords,getFeesByStudentId,getAllAnnouncements,createAnnouncement,deleteAnnouncement, getStudentFeeStatement} from '../../controllers/adminStudentController.js';
import adminAuth from '../../middlewares/adminAuth.js'
import { authorizeAnyPermission, authorizePermissions } from '../../middleware/permissions.js';
const adminStudentRouter = express.Router();
import upload from '../../middlewares/multer.js'

// Route to get all students
adminStudentRouter.get('/students',adminAuth,authorizeAnyPermission('students.view', 'dashboard.view', 'fees.view'),getAllStudents);

//Route to get students by class name
adminStudentRouter.get('/students/by-class/:className',adminAuth,authorizeAnyPermission('students.view', 'books.view'),getStudentsByClassName);


// SPECIFIC ROUTES BEFORE PARAMETERIZED ROUTES
adminStudentRouter.post('/student/create',adminAuth,authorizePermissions('students.view'),upload.single("avatar"),createStudent);
adminStudentRouter.get('/student/feesRecords',adminAuth,authorizeAnyPermission('fees.view', 'dashboard.view'),getAllFeesRecords);
adminStudentRouter.get('/feesRecords/:studentId',adminAuth,authorizePermissions('fees.view'),getFeesByStudentId);
adminStudentRouter.get('/student/:studentId/statement',adminAuth,authorizePermissions('fees.view'),getStudentFeeStatement);

// PARAMETERIZED ROUTES LAST
adminStudentRouter.delete('/student/:studentId',adminAuth,authorizePermissions('students.view'),deleteStudent);
adminStudentRouter.put('/student/:studentId',adminAuth,authorizePermissions('students.view'),upload.single("avatar"),updateStudent);
adminStudentRouter.get('/student/:studentId',adminAuth,authorizePermissions('students.view'), getStudentById);

//Announcement Routes 
adminStudentRouter.get('/announcements',adminAuth,authorizePermissions('dashboard.view'),getAllAnnouncements);
adminStudentRouter.post('/announcement/create',adminAuth,authorizePermissions('dashboard.view'),createAnnouncement);
adminStudentRouter.delete('/announcement/:announcementId',adminAuth,authorizePermissions('dashboard.view'),deleteAnnouncement);

export default adminStudentRouter;
