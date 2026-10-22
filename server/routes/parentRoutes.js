import express from "express";
import { getParentProfile, loginParent } from "../controllers/parentController.js";
import parentAuth from "../middlewares/parentAuth.js";

const parentRouter = express.Router();

parentRouter.post("/parentLogin", loginParent);
parentRouter.get("/parent/profile", parentAuth, getParentProfile);

export default parentRouter;