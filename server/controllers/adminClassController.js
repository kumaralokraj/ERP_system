import {
  createClassSession,
  deleteClassSession,
  getClassSessionById,
  getLegacyCompatibleClassSessions,
  updateClassSession,
} from "./academicStructureController.js";

const mapLegacyParamToSessionId = (req) => {
  req.params.id = req.params.classId;
};

export const getAllClasses = (req, res) => getLegacyCompatibleClassSessions(req, res);

export const createClass = (req, res) => createClassSession(req, res);

export const updateClass = (req, res) => {
  mapLegacyParamToSessionId(req);
  return updateClassSession(req, res);
};

export const deleteClass = (req, res) => {
  mapLegacyParamToSessionId(req);
  return deleteClassSession(req, res);
};

export const getClassById = (req, res) => {
  mapLegacyParamToSessionId(req);
  return getClassSessionById(req, res);
};
