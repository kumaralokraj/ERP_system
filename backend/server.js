import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { connectDB } from './configs/mongodb.js';
import connectCloudinary from './configs/cloudinary.js';
import signupRouter from "./routes/signupRouter.js";
import adminStudentRouter from './routes/admin/adminStudentRoute.js';
import adminStudentBulkRouter from './routes/admin/adminStudentBulkRoute.js';
import adminTeacherRouter from './routes/admin/adminTeacherRoute.js';
import adminLoginRouter from './routes/admin/adminLoginRoute.js';
import adminClassRouter from './routes/admin/adminClassRoute.js';
import adminUniformRouter from './routes/admin/adminUniformRoutes.js';
import adminBooksRouter from './routes/admin/adminBooksRoute.js';
import adminProfileRouter from './routes/admin/adminProfileRoute.js';
import adminFamilyFeesRouter from './routes/admin/adminFamilyFeesRoute.js';
import academicRouter from './routes/academicRoutes.js';
import promotionRouter from './routes/promotionRoutes.js';
import resultRouter from './routes/resultRoutes.js';
import sessionRolloverRouter from './routes/sessionRolloverRoutes.js';
import userRouter from './routes/userRoutes.js';

import studentLoginRouter from './routes/student/studentLoginRoute.js';
import studentRouter from './routes/student/studentRoutes.js';
import parentRouter from './routes/parentRoutes.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allowed origins
const allowedOrigins = [
  "https://goldenpublicschool719.uc.r.appspot.com",
  "https://goldenpublicschool719.el.r.appspot.com",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000"
];

// CORS middleware with explicit preflight handling
const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'token'],
};

app.use(cors(corsOptions)); // Handle CORS for all routes including preflight

app.use(express.json());

// Connect DB
await connectDB();
await connectCloudinary();

// API routes
app.get('/api/health', (req, res) => {
  res.send("Backend running");
});

// Public auth routes must be mounted before any protected catch-all routers.
app.use('/', adminLoginRouter);
app.use('/', studentLoginRouter);
app.use('/', parentRouter);

// Mount user-management routes before generic /admin routers to avoid middleware interception.
app.use('/admin/users', userRouter);

app.use('/api/students', adminStudentBulkRouter);

app.use('/admin', adminStudentRouter);
app.use('/admin', adminFamilyFeesRouter);
app.use('/admin', adminTeacherRouter);
app.use('/admin', adminClassRouter);
app.use('/admin/uniforms', adminUniformRouter);
app.use('/admin/books', adminBooksRouter);
app.use('/admin', adminProfileRouter);
app.use('/', resultRouter);
app.use('/', sessionRolloverRouter);
app.use('/', promotionRouter);
app.use('/', academicRouter);
app.use('/', adminLoginRouter);
app.use('/', studentLoginRouter);
app.use('/', signupRouter);

app.use('/student', studentRouter);

// Serve frontend LAST
// Don't cache index.html - always fetch fresh
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html') {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Catch-all LAST - only for SPA routes, not static files
app.use((req, res) => {
  // Don't serve index.html for requests with file extensions or known static paths
  if (req.path.includes('.') || req.path.includes('/assets/')) {
    return res.status(404).send('Not found');
  }
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
