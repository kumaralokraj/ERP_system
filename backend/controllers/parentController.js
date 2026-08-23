import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Family from "../models/Family.js";
import Student from "../models/Student.js";

export const loginParent = async (req, res) => {
  try {
    const familyCode = String(req.body.familyCode || "").trim().toUpperCase();
    const password = String(req.body.password || "");

    if (!familyCode || !password) {
      return res.status(400).json({ success: false, message: "Family code and password are required" });
    }

    const family = await Family.findOne({ familyCode, status: "active" }).select("+password");
    if (!family) {
      return res.status(401).json({ success: false, message: "Invalid family code or password" });
    }

    // Existing families can use their registered phone as the initial password.
    const validPassword = family.password
      ? await bcrypt.compare(password, family.password)
      : password === family.primaryPhone;
    if (!validPassword) {
      return res.status(401).json({ success: false, message: "Invalid family code or password" });
    }

    if (!family.password) {
      family.password = await bcrypt.hash(password, 10);
      await family.save();
    }

    const token = jwt.sign(
      { familyId: family._id.toString(), role: "parent", familyCode: family.familyCode },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: { id: family._id, role: "parent", familyCode: family.familyCode, name: family.displayName },
    });
  } catch (error) {
    console.error("Parent login error:", error);
    return res.status(500).json({ success: false, message: "Unable to log in" });
  }
};

export const getParentProfile = async (req, res) => {
  try {
    const family = await Family.findById(req.parent.familyId).select("-password").lean();
    if (!family || family.status !== "active") {
      return res.status(404).json({ success: false, message: "Family not found" });
    }

    const students = await Student.find({ familyId: family._id })
      .select("firstName lastName name studentId class section")
      .populate("class", "name displayName")
      .lean();

    return res.json({ success: true, family, students });
  } catch (error) {
    console.error("Parent profile error:", error);
    return res.status(500).json({ success: false, message: "Unable to load family profile" });
  }
};