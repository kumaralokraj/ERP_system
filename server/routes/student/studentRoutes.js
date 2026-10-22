import express from 'express';
import { getStudentProfile , getStudentFees ,getIssuedBooks,getBooks, getAvailableUniformItems, getStudentUniforms,getAllAnnouncements} from '../../controllers/studentController.js';
import studentAuth from '../../middlewares/studentAuth.js';
const studentRouter = express.Router();


//Route to get student profile
studentRouter.get('/profile',studentAuth,getStudentProfile);
studentRouter.get('/fees',studentAuth,getStudentFees);
studentRouter.get('/issuedBooks',studentAuth,getIssuedBooks);
studentRouter.get('/books',studentAuth,getBooks);
studentRouter.get('/uniformItems',studentAuth,getAvailableUniformItems);
studentRouter.get('/studentUniforms',studentAuth,getStudentUniforms);
studentRouter.get('/announcements',studentAuth,getAllAnnouncements);
export default studentRouter;