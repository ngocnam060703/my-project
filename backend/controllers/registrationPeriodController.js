const RegistrationPeriod = require("../models/RegistrationPeriod");

exports.getActive = async (req, res) => {
  try {
    const now = new Date();
    const period = await RegistrationPeriod.findOne({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });
    res.json(period);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const periods = await RegistrationPeriod.find().sort({ startDate: -1 });
    res.json(periods);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, startDate, endDate, note } = req.body;
    const period = await RegistrationPeriod.create({ name, startDate, endDate, note });
    res.status(201).json(period);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const period = await RegistrationPeriod.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!period) return res.status(404).json({ message: "Không tìm thấy đợt đăng ký" });
    res.json(period);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    await RegistrationPeriod.findByIdAndDelete(req.params.id);
    res.json({ message: "Đã xóa" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
