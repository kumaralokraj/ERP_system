import {
  cloneClassSessionsForYear,
  previewSessionRollover,
} from "../services/sessionRolloverService.js";

export const getSessionRolloverPreview = async (req, res) => {
  try {
    const result = await previewSessionRollover({
      sourceYear: req.query.sourceYear,
      targetYear: req.query.targetYear,
    });

    if (result.error) {
      return res.status(result.error.statusCode).json({
        success: false,
        message: result.error.message,
      });
    }

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to preview session rollover",
    });
  }
};

export const cloneSessionRollover = async (req, res) => {
  try {
    const result = await cloneClassSessionsForYear({
      sourceYear: req.body.sourceYear,
      targetYear: req.body.targetYear,
      selectedClassSessionIds: Array.isArray(req.body.selectedClassSessionIds)
        ? req.body.selectedClassSessionIds
        : [],
    });

    if (result.error) {
      return res.status(result.error.statusCode).json({
        success: false,
        message: result.error.message,
      });
    }

    return res.status(result.errors?.length ? 207 : 201).json({
      success: result.errors?.length === 0,
      message: result.errors?.length
        ? "Session rollover completed with errors"
        : "Session rollover completed successfully",
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to clone class sessions",
    });
  }
};
