import {loginStudent} from '../../controllers/studentController.js';
import express from 'express';

const studentLoginRouter = express.Router();

// Route for student login
studentLoginRouter.post('/studentLogin',loginStudent);

export default studentLoginRouter;