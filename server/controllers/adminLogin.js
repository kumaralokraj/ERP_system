import { loginUser } from './userController.js';

const adminLogin = async (req, res) => loginUser(req, res);

export default adminLogin;
