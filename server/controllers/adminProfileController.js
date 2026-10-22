import User from '../models/User.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import ClassSession from '../models/ClassSession.js';
import { trimString } from '../utils/requestValidation.js';

const splitName = (fullName = '') => {
  const normalized = trimString(fullName);
  if (!normalized) {
    return { firstName: '', lastName: '' };
  }

  const [firstName, ...rest] = normalized.split(' ');
  return {
    firstName: firstName || '',
    lastName: rest.join(' '),
  };
};

const formatProfile = (user) => {
  const { firstName, lastName } = splitName(user.name || '');
  return {
    _id: user._id,
    firstName,
    lastName,
    email: user.email,
    phone: user.phone || '',
    position: user.position || (user.role === 'admin' ? 'Administrator' : user.role),
    department: user.department || 'School Administration',
    address: user.address || '',
    city: user.city || '',
    state: user.state || '',
    zipCode: user.zipCode || '',
    profileImage: user.profileImage || '',
    joinDate: user.createdAt,
    lastLogin: user.lastLogin,
    role: user.role,
  };
};

// GET /admin/profile
export const getAdminProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -loginHistory');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }

    const [totalStudents, totalTeachers, totalClasses] = await Promise.all([
      Student.countDocuments(),
      Teacher.countDocuments(),
      ClassSession.countDocuments(),
    ]);

    return res.json({
      success: true,
      admin: formatProfile(user),
      stats: {
        totalStudents,
        totalTeachers,
        totalClasses,
      },
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /admin/profile
export const updateAdminProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }

    const currentNames = splitName(user.name || '');
    const nextFirstName =
      req.body.firstName !== undefined ? trimString(req.body.firstName) : currentNames.firstName;
    const nextLastName =
      req.body.lastName !== undefined ? trimString(req.body.lastName) : currentNames.lastName;

    if (!nextFirstName) {
      return res.status(400).json({ success: false, message: 'First name is required' });
    }

    user.name = trimString(`${nextFirstName} ${nextLastName}`);

    const optionalFields = ['phone', 'position', 'department', 'address', 'city', 'state', 'zipCode'];
    optionalFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        user[field] = trimString(req.body[field]);
      }
    });

    await user.save();

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      admin: formatProfile(user),
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /admin/change-password
export const changeAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ success: false, message: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /admin/login-history
export const getLoginHistory = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('loginHistory');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const history = (user.loginHistory || [])
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    return res.json({ success: true, loginHistory: history });
  } catch (error) {
    console.error('Error fetching login history:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
