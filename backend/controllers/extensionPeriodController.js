const ContractExtensionPeriod = require("../models/ContractExtensionPeriod");
const { autoCloseExpiredExtensionPeriods } = require("../services/contractExtensionPolicy");

exports.autoCloseExpiredExtensionPeriods = autoCloseExpiredExtensionPeriods;

exports.getActive = async (req, res) => {
  try {
    const now = new Date();
    await autoCloseExpiredExtensionPeriods(now);
    const period = await ContractExtensionPeriod.findOne({
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
    await autoCloseExpiredExtensionPeriods(new Date());
    const periods = await ContractExtensionPeriod.find().sort({ startDate: -1 });
    res.json(periods);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    await autoCloseExpiredExtensionPeriods(new Date());
    const { name, startDate, endDate, note } = req.body;
    const period = await ContractExtensionPeriod.create({ name, startDate, endDate, note });
    res.status(201).json(period);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    await autoCloseExpiredExtensionPeriods(new Date());
    const { name, startDate, endDate, note, isActive } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (startDate !== undefined) updates.startDate = startDate;
    if (endDate !== undefined) updates.endDate = endDate;
    if (note !== undefined) updates.note = note;
    if (isActive !== undefined) updates.isActive = !!isActive;

    if (updates.isActive === true) {
      await ContractExtensionPeriod.updateMany({ _id: { $ne: req.params.id } }, { $set: { isActive: false } });
    }

    const period = await ContractExtensionPeriod.findByIdAndUpdate(req.params.id, updates, { returnDocument: 'after' });
    if (!period) return res.status(404).json({ message: "Không tìm thấy đợt gia hạn" });
    res.json(period);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    await ContractExtensionPeriod.findByIdAndDelete(req.params.id);
    res.json({ message: "Đã xóa" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
