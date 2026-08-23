import mongoose from 'mongoose';

const StudentSchema = new mongoose.Schema({
    username: {
        type:String,
        required:true,
        trim:true,
        minlength:3,
    },
    email: {
        type:String,
        required:true,
        unique:true,
        lowercase:true,
        match:[/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please provide a valid email"],
    },
    password: {
        type:String,
        required:true,
        minlength:6,
    },

    // Personal Information
    name: {
      type: String,
      required: false,
      trim: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    phone:{
        type:String,
        required:true,
        match: [/^\d{10,15}$/, "Please provide a valid phone number"],
    },
    address: {
        type:String,
        required:false,
    },
    bloodType: {
        type:String,
        enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    },
    birthday: {
        type:Date,
        required:false,
    },
    sex: {
        type:String,
        enum:["Male","Female","Other"],
        required:true,
        default:"Male",
    },
    photo: {
        type:String,
        required:false,
    },

    //Academic Information
    studentId: {
        type:String,
        required:true,
        unique:true,
    },
    admissionNo: {
        type:String,
        required:false,
        trim:true,
    },
    class: {
        type: mongoose.Schema.ObjectId,
        required: true,
    },
    section: {
        type:String,
        required:false,
    },
    enrollmentDate: {
      type: Date,
      default: Date.now,
    },

    // Parent/Guardian Information
    parentName: {
      type: String,
      required: false,
    },
    parentPhone: {
      type: String,
      required: false,
    },
    parentEmail: {
      type: String,
      required: false,
    },
    parent: {
      fatherName: {
        type: String,
        required: false,
        trim: true,
      },
      motherName: {
        type: String,
        required: false,
        trim: true,
      },
      phone: {
        type: String,
        required: false,
        trim: true,
      },
    },

    familyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      default: null,
      index: true,
    },
    familyKey: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    // Student-specific fee decisions made during admission.
    feeSettings: {
      transportOpted: {
        type: Boolean,
        default: true,
      },
      transportFee: {
        type: Number,
        default: 0,
        min: 0,
      },
      admissionFeeOverride: {
        type: Number,
        default: null,
        min: 0,
      },
      tuitionConcession: {
        type: {
          type: String,
          enum: ["none", "fixed", "percentage"],
          default: "none",
        },
        value: {
          type: Number,
          default: 0,
          min: 0,
        },
        reason: {
          type: String,
          default: "",
          trim: true,
        },
        isActive: {
          type: Boolean,
          default: false,
        },
      },
    },

    // Status
    status: {
      type: String,
      enum: ["active", "inactive", "graduated", "suspended", "transferred", "dropped"],
      default: "active",
    },
},{ timestamps: true });

StudentSchema.pre("validate", function syncSearchableStudentFields() {
  const fullName = `${this.firstName || ""} ${this.lastName || ""}`.trim();
  if (fullName) {
    this.name = fullName;
  }

  if (!this.admissionNo && this.studentId) {
    this.admissionNo = this.studentId;
  }

  if (!this.parent?.phone && this.parentPhone) {
    this.parent = {
      ...(this.parent?.toObject ? this.parent.toObject() : this.parent),
      phone: this.parentPhone,
    };
  }

  this.feeSettings = {
    transportOpted: this.feeSettings?.transportOpted !== false,
    transportFee:
      this.feeSettings?.transportOpted === false
        ? 0
        : Math.max(0, Number(this.feeSettings?.transportFee || 0) || 0),
    admissionFeeOverride:
      this.feeSettings?.admissionFeeOverride === null ||
      this.feeSettings?.admissionFeeOverride === undefined ||
      this.feeSettings?.admissionFeeOverride === ""
        ? null
        : Number(this.feeSettings.admissionFeeOverride),
    tuitionConcession: {
      type: ["fixed", "percentage"].includes(this.feeSettings?.tuitionConcession?.type)
        ? this.feeSettings.tuitionConcession.type
        : "none",
      value: Math.max(0, Number(this.feeSettings?.tuitionConcession?.value || 0) || 0),
      reason: String(this.feeSettings?.tuitionConcession?.reason || "").trim(),
      isActive:
        ["fixed", "percentage"].includes(this.feeSettings?.tuitionConcession?.type) &&
        this.feeSettings?.tuitionConcession?.isActive !== false,
    },
  };
});

StudentSchema.index({ name: 1 });
StudentSchema.index({ firstName: 1, lastName: 1 });
StudentSchema.index({ admissionNo: 1 });
StudentSchema.index({ parentName: 1 });
StudentSchema.index({ parentPhone: 1 });
StudentSchema.index({ "parent.phone": 1 });
StudentSchema.index({ "parent.fatherName": 1 });
StudentSchema.index({ "parent.motherName": 1 });

const Student = mongoose.model('Student',StudentSchema);

export default Student;
