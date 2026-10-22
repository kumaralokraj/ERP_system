import express from 'express';
import { getAllTeachers,createTeacher,updateTeacher,deleteTeacher,getTeacherById } from '../../controllers/adminTeacherController.js';
import adminAuth from '../../middlewares/adminAuth.js';
import { authorizeAnyPermission, authorizePermissions } from '../../middleware/permissions.js';
const adminTeacherRouter = express.Router();

//Route to get all teachers
adminTeacherRouter.get('/teachers', adminAuth, authorizeAnyPermission('teachers.view', 'dashboard.view'), getAllTeachers);

//Route to create a new Teacher
adminTeacherRouter.post('/teacher/create',adminAuth,authorizePermissions('teachers.view'),createTeacher);

//Route to update an existing teacher
adminTeacherRouter.put('/teacher/:teacherId',adminAuth,authorizePermissions('teachers.view'),updateTeacher);

//Route to delte a teacher
adminTeacherRouter.delete('/teacher/:teacherId',adminAuth,authorizePermissions('teachers.view'),deleteTeacher);

//Route to get a single teacher
adminTeacherRouter.get('/teacher/:teacherId',adminAuth,authorizePermissions('teachers.view'), getTeacherById);

export default adminTeacherRouter;