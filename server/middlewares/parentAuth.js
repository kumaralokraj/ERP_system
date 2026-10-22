import jwt from "jsonwebtoken";

const parentAuth = (req, res, next) => {
  try {
    const token = req.headers.token || req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized access" });
    }

    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    if (decodedToken?.role !== "parent" || !decodedToken.familyId) {
      return res.status(403).json({ success: false, message: "Parent access required" });
    }

    req.parent = decodedToken;
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Unauthorized access" });
  }
};

export default parentAuth;