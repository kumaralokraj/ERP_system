import express from "express";
import { body } from "express-validator";
import signup from "../controllers/signup.js";

const signupRouter = express.Router();

signupRouter.post(
  "/api/auth/signup",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),

    body("email")
      .isEmail()
      .withMessage("Valid email is required"),

    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),

    body("role")
      .equals("student")
      .withMessage("Only students can sign up here"),
  ],
  signup
);

export default signupRouter;