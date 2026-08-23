import Teacher from "../models/Teacher.js";
import ClassSession from "../models/ClassSession.js";
import LegacyClass from "../models/LegacyClass.js";
import {
    TEACHER_GENDER_OPTIONS,
    getFriendlyMongooseError,
    isFutureDate,
    isValidEmail,
    isValidObjectId,
    isValidPhone,
    normalizeDigits,
    normalizeEmail,
    sendValidationError,
    toNumber,
    trimString,
} from "../utils/requestValidation.js";

const buildTeacherPayload = (body = {}, { includePassword = true } = {}) => {
    const teacherData = {
        name: trimString(body.name),
        email: normalizeEmail(body.email),
        password: body.password || "",
        phone: normalizeDigits(body.phone) || undefined,
        gender: trimString(body.gender) || "Male",
        dob: body.dob || undefined,
        address: trimString(body.address) || undefined,
        employeeId: trimString(body.employeeId) || undefined,
        qualification: trimString(body.qualification) || undefined,
        experienceYears: body.experienceYears === "" || body.experienceYears === undefined
            ? 0
            : toNumber(body.experienceYears),
        joiningDate: body.joiningDate || undefined,
    };

    if (!includePassword || !teacherData.password) {
        delete teacherData.password;
    }

    return teacherData;
};

const validateTeacherPayload = async (
    teacherData,
    { requirePassword = true, excludeTeacherId = null } = {}
) => {
    if (!teacherData.name || !teacherData.email) {
        return { message: "Name and email are required" };
    }

    if (!isValidEmail(teacherData.email)) {
        return { message: "Please provide a valid email address" };
    }

    if (requirePassword && !teacherData.password) {
        return { message: "Password is required" };
    }

    if (teacherData.password && teacherData.password.length < 6) {
        return { message: "Password must be at least 6 characters" };
    }

    if (teacherData.phone && !isValidPhone(teacherData.phone)) {
        return { message: "Phone number must be 10 to 15 digits" };
    }

    if (!TEACHER_GENDER_OPTIONS.includes(teacherData.gender)) {
        return { message: "Please select a valid gender" };
    }

    if (teacherData.dob && isFutureDate(teacherData.dob)) {
        return { message: "Date of birth cannot be in the future" };
    }

    if (teacherData.joiningDate && isFutureDate(teacherData.joiningDate)) {
        return { message: "Joining date cannot be in the future" };
    }

    if (!Number.isInteger(teacherData.experienceYears) || teacherData.experienceYears < 0) {
        return { message: "Experience must be a whole number 0 or greater" };
    }

    if (teacherData.dob && teacherData.joiningDate) {
        const dobDate = new Date(teacherData.dob);
        const joiningDate = new Date(teacherData.joiningDate);
        if (!Number.isNaN(dobDate.getTime()) && !Number.isNaN(joiningDate.getTime()) && joiningDate < dobDate) {
            return { message: "Joining date cannot be before date of birth" };
        }
    }

    const duplicateTeacherEmailQuery = {
        email: teacherData.email,
    };

    if (excludeTeacherId) {
        duplicateTeacherEmailQuery._id = { $ne: excludeTeacherId };
    }

    const existingEmailTeacher = await Teacher.findOne(duplicateTeacherEmailQuery);
    if (existingEmailTeacher) {
        return { message: "Teacher with this email already exists" };
    }

    if (teacherData.employeeId) {
        const duplicateEmployeeIdQuery = {
            employeeId: teacherData.employeeId,
        };

        if (excludeTeacherId) {
            duplicateEmployeeIdQuery._id = { $ne: excludeTeacherId };
        }

        const existingEmployeeIdTeacher = await Teacher.findOne(duplicateEmployeeIdQuery);
        if (existingEmployeeIdTeacher) {
            return { message: "Teacher with this employee ID already exists" };
        }
    }

    return null;
};

// Get all teachers
export const getAllTeachers = async(req,res) => {
    try{
        const teachers = await Teacher.find();
        res.status(200).json({message:'Teachers fetched successfully',teachers});
    }catch(error){
        console.error('Error fetching teachers : ',error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

// Create a new teacher
export const createTeacher = async(req,res) =>{
    try{
        console.log('Request Body:', req.body);

        const teacherData = buildTeacherPayload(req.body, { includePassword: true });

        const validationError = await validateTeacherPayload(teacherData, {
            requirePassword: true,
        });
        if (validationError) {
            return sendValidationError(res, validationError.message);
        }

        const newTeacher = await Teacher.create(teacherData);
        const teacherResponse = await Teacher.findById(newTeacher._id).select("-password");
        res.status(201).json({success:true,message:'Teacher created successfully',teacher:teacherResponse});
    }catch(error){
        console.error('Error creating teacher : ',error);
        const friendlyMessage = getFriendlyMongooseError(error, 'Internal server error');
        const statusCode = error.code === 11000 || error.name === "ValidationError" ? 400 : 500;
        res.status(statusCode).json({ success: false, message: friendlyMessage });
    }
}

// Update a teacher
export const updateTeacher = async (req, res) => {
    try {
        const { teacherId } = req.params;

        if (!teacherId || !isValidObjectId(teacherId)) {
            return sendValidationError(res, "Valid teacher ID is required");
        }

        const existingTeacher = await Teacher.findById(teacherId);
        if (!existingTeacher) {
            return res.status(404).json({
                success: false,
                message: "Teacher not found",
            });
        }

        const includePassword = Boolean(trimString(req.body.password));
        const teacherData = buildTeacherPayload(req.body, { includePassword });

        const validationError = await validateTeacherPayload(teacherData, {
            requirePassword: false,
            excludeTeacherId: teacherId,
        });
        if (validationError) {
            return sendValidationError(res, validationError.message);
        }

        const updatedTeacher = await Teacher.findByIdAndUpdate(teacherId, teacherData, {
            new: true,
            runValidators: true,
        }).select("-password");

        res.status(200).json({
            success: true,
            message: "Teacher updated successfully",
            teacher: updatedTeacher,
        });
    } catch (error) {
        console.error("Error updating teacher:", error);
        const friendlyMessage = getFriendlyMongooseError(error, "Internal server error");
        const statusCode = error.code === 11000 || error.name === "ValidationError" ? 400 : 500;
        res.status(statusCode).json({ success: false, message: friendlyMessage });
    }
};

// Delete a teacher
export const deleteTeacher = async(req,res) =>{
    try{
        const {teacherId} = req.params;

        if (!teacherId || !isValidObjectId(teacherId)) {
            return sendValidationError(res, "Valid teacher ID is required");
        }

        const teacher = await Teacher.findById(teacherId);
        if (!teacher) {
            return res.status(404).json({
                success: false,
                message: "Teacher not found",
            });
        }

        const assignedClassSession = await ClassSession.findOne({ classTeacher: teacherId })
            .populate("classId", "name")
            .select("classId section academicYear");
        if (assignedClassSession) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete teacher while assigned to class ${assignedClassSession.classId?.name}${assignedClassSession.section ? `-${assignedClassSession.section}` : ""} (${assignedClassSession.academicYear}). Reassign this class first.`,
            });
        }

        const assignedLegacyClass = await LegacyClass.findOne({ classTeacher: teacherId })
            .select("name section academicYear");
        if (assignedLegacyClass) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete teacher while assigned to class ${assignedLegacyClass.name}${assignedLegacyClass.section ? `-${assignedLegacyClass.section}` : ""} (${assignedLegacyClass.academicYear}). Reassign this class first.`,
            });
        }

        await Teacher.findByIdAndDelete(teacherId);
        console.log(`Teacher with ID ${teacherId} hard deleted.`);
        res.status(200).json({success:true,message:'Teacher deleted successfully'});
    }catch(error){
        console.error('Error deleting teacher : ',error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

// Get a single teacher by ID
export const getTeacherById = async (req, res) => {
    try {
        const { teacherId } = req.params;
        const teacher = await Teacher.findById(teacherId);

        if (!teacher) {
            return res.status(404).json({
                success: false,
                message: "Teacher not found",
            });
        }

        res.status(200).json({
            success: true,
            teacher,
        });
    } catch (error) {
        console.error("Error fetching teacher:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};
