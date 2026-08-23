import bcrypt from "bcrypt";
import Student from "../models/Student.js";

const normalizeText = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

const signup = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    if (role !== "student") {
      return res.status(400).json({
        message: "Only students can sign up here",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const student = await Student.findOne({ email: normalizedEmail });

    if (!student) {
      return res.status(404).json({
        message: "No student was found with this email. Ask the admin to add you first.",
      });
    }

    const studentName = normalizeText(student.name || `${student.firstName} ${student.lastName}`);
    if (studentName !== normalizeText(name)) {
      return res.status(403).json({
        message: "Name does not match the student record",
      });
    }

    if (student.password && student.password.startsWith("$2")) {
      return res.status(409).json({
        message: "This student account is already registered. Please log in.",
      });
    }

    student.password = await bcrypt.hash(password, 10);
    await student.save();

    return res.status(201).json({
      message: "Account created successfully",
      user: {
        id: student._id,
        name: student.name || `${student.firstName} ${student.lastName}`.trim(),
        email: student.email,
        role: "student",
      },
    });
  } catch (error) {
    console.error("Signup error:", error);

    return res.status(500).json({
      message: "Server error during signup",
    });
  }
};

export default signup;