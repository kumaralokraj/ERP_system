import Student from '../models/Student.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import StudentBook from '../models/StudentBook.js';
import Book from '../models/Book.js';
import UniformItem from '../models/UniformItem.js';
import { getUniformPriceSummary, getUniformSizesWithPrices } from '../utils/uniformPricing.js';
import StudentUniform from '../models/StudentUniform.js';
import Announcement from '../models/Announcement.js';
import {
    normalizeEmail,
    sendValidationError,
} from '../utils/requestValidation.js';
import {
    attachAcademicContextToStudents,
    calculateFeeBreakdownTotal,
    calculateStudentFeeBreakdown,
    normalizeStudentFeeSettings,
    resolveFeesRecordForStudent,
    resolveFeesStatus,
} from '../services/academicStructureService.js';
import {
    buildFeeInstallments,
    normalizeFeeFrequency,
    summarizeInstallmentsByFeeType,
} from '../utils/feeInstallmentEngine.js';
import { isDiaryItem } from '../utils/bookInventory.js';

const normalizeStudentFeesRecord = (feesRecord = {}) => {
    const feeSettings = normalizeStudentFeeSettings({
        ...(feesRecord.student?.feeSettings || {}),
        ...(feesRecord.feeSettings || {}),
    });
    const calculatedFeeBreakdown = calculateStudentFeeBreakdown(feesRecord.class, feeSettings);
    const recordedFeeBreakdown = feesRecord.feeBreakdown || {};
    const hasInstallmentSnapshot =
        Array.isArray(feesRecord.feeInstallments) && feesRecord.feeInstallments.length > 0;
    const feeBreakdown =
        hasInstallmentSnapshot && calculateFeeBreakdownTotal(recordedFeeBreakdown) > 0
            ? recordedFeeBreakdown
            : calculateFeeBreakdownTotal(calculatedFeeBreakdown) > 0
            ? calculatedFeeBreakdown
            : recordedFeeBreakdown || calculatedFeeBreakdown;
    const totalFees = calculateFeeBreakdownTotal(feeBreakdown);
    const paidAmount = Number(feesRecord.paidAmount || 0);
    const feeFrequency = normalizeFeeFrequency();
    const feeInstallments = buildFeeInstallments({
        academicYear: feesRecord.class?.academicYear,
        feeBreakdown,
        feeFrequency,
        existingInstallments: feesRecord.feeInstallments,
        paymentHistory: feesRecord.paymentHistory,
        tuitionConcession: feeSettings.tuitionConcession,
    });

    return {
        ...feesRecord,
        totalFees,
        paidAmount,
        remaining: Math.max(totalFees - paidAmount, 0),
        status: resolveFeesStatus({ paidAmount, totalFees, dueDate: feesRecord.dueDate }),
        feeSettings,
        feeBreakdown,
        feeFrequency,
        feeInstallments,
        installmentSummary: summarizeInstallmentsByFeeType(feeInstallments),
    };
};

//student login
export const loginStudent = async (req, res) => {

    try {

        const email = normalizeEmail(req.body.email);
        const password = req.body.password || "";

        if (!email || !password) {
            return sendValidationError(res, "Email and password are required");
        }

        //checking user exist or not
        const student = await Student.findOne({ email });

        if (!student) {
            return res.status(404).json({ success: false, message: "User doesn't exist" });
        }


        const passwordMatches = student.password?.startsWith('$2')
            ? await bcrypt.compare(password, student.password)
            : password === student.password;

        if (passwordMatches) {
            const token = jwt.sign(email, process.env.JWT_SECRET);
            res.json({ success: true, message: "Login successful", token });
        }
        else {
            res.status(401).json({ success: false, message: "Invalid credentials" });
        }

    }
    catch (error) {
        console.log("Error in user login", error);
        res.status(500).json({ success: false, message: error.message })
    }

}

//get student profile
export const getStudentProfile = async (req, res) => {
    try {
        const studentEmail = req.student; // Extracted from token in middleware
        const studentRecord = await Student.findOne({ email: studentEmail }).select('-password');
        const [student] = await attachAcademicContextToStudents(studentRecord ? [studentRecord] : []);
        if (!student) {
            return res.json({ success: false, message: "Student not found" });
        }
        res.json({ success: true, student });
    } catch (error) {
        console.error("Error fetching student profile:", error);
        res.json({ success: false, message: "Error fetching profile" });
    }


}

// Get student fees
export const getStudentFees = async (req, res) => {
    try {
        const studentEmail = req.student; // Extracted from token in middleware
        const student = await Student.findOne({ email: studentEmail });
        if (!student) {
            return res.json({ success: false, message: "Student not found" });
        }
        const {
            feesRecord,
            error: feesRecordError,
        } = await resolveFeesRecordForStudent(student._id, {
            createIfMissing: false,
            academicYear: req.query.academicYear,
        });

        if (feesRecordError || !feesRecord) {
            return res.json({
                success: false,
                message: feesRecordError?.message || "Error fetching fees",
            });
        }

        res.json({ success: true, fees: [normalizeStudentFeesRecord(feesRecord)] });
    } catch (error) {
        console.error("Error fetching student fees:", error);
        res.json({ success: false, message: "Error fetching fees" });
    }
}


// Get student's issued books
export const getIssuedBooks = async (req, res) => {
    try {
        const studentEmail = req.student; // Extracted from token in middleware
        const student = await Student.findOne({ email: studentEmail });
        if (!student) {
            return res.json({ success: false, message: "Student not found" });
        }

        const studentBooks = await StudentBook.find({ studentId: student._id })
            .populate('bookId', 'name subject itemType')
            .sort({ issueDate: -1 });
        console.log("Students books :", studentBooks);

        if (!studentBooks || studentBooks.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No books issued to this student',
            });
        }

        res.status(200).json({
            success: true,
            count: studentBooks.length,
            data: studentBooks,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching student books',
            error: error.message,
        });
    }
};

//get books
export const getBooks = async (req, res) => {
    try {
        const studentEmail = req.student; // Extracted from token in middleware
        const studentRecord = await Student.findOne({ email: studentEmail }).select('-password');
        const [student] = await attachAcademicContextToStudents(studentRecord ? [studentRecord] : []);
        if (!student) {
            return res.json({ success: false, message: "Student not found" });
        }

        const Books = await Book.find({
            $or: [
                { className: student.class?.name },
                { itemType: 'diary' },
            ],
        })

        console.log("books :", Books);

        if (!Books || Books.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No books',
            });
        }

        res.status(200).json({
            success: true,
            count: Books.length,
            data: Books.map((book) => ({
                ...book.toObject(),
                itemType: isDiaryItem(book) ? 'diary' : 'book',
            })),
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching student books',
            error: error.message,
        });
    }
};

// Get student's uniform items
export const getStudentUniforms = async (req, res) => {
    try {
        const studentEmail = req.student; // Extracted from token in middleware
        const student = await Student.findOne({ email: studentEmail });
        if (!student) {
            return res.json({ success: false, message: "Student not found" });
        }

        const studentUniforms = await StudentUniform.find({ student: student._id });
        res.json({ success: true, studentUniforms });
    }catch(error){
        console.error("Error fetching student uniforms:", error);
        res.json({ success: false, message: "Error fetching uniforms" });
    }
}

// Get available uniform items for the student's class
export const getAvailableUniformItems = async (req, res) => {
    try {       
        const items = await UniformItem.find().lean();
        const uniformItems = items.map((item) => ({
            ...item,
            sizes: getUniformSizesWithPrices(item),
            ...getUniformPriceSummary(item),
        }));
        res.json({ success: true, uniformItems });
    } catch (error) {
        console.error("Error fetching uniform items:", error);
        res.json({ success: false, message: "Error fetching uniform items" });
    }
}

//get All announcement 

export const getAllAnnouncements = async (req, res) => {
    try{
        const announcements = await Announcement.find().sort({ createdAt: -1 });
        res.status(200).json({ announcements });
    }catch(error){
        console.error('Error fetching announcements:',error);
        res.status(500).json({message:'Internal server error'});
    }
}



