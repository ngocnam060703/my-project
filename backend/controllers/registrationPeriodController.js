const RegistrationPeriod = require("../models/RegistrationPeriod");
const { findOpenRegistrationPeriod, findNextRegistrationPeriod } = require("../services/registrationPeriodPolicy");

async function autoCloseExpiredPeriods(now = new Date()) {
  await RegistrationPeriod.updateMany(
    {
      isActive: true,
      endDate: { $lt: now },
    },
    { $set: { isActive: false } }
  );
}

exports.autoCloseExpiredPeriods = autoCloseExpiredPeriods;

exports.getActive = async (req, res) => {
  try {
    const now = new Date();
    await autoCloseExpiredPeriods(now);
    const period = await findOpenRegistrationPeriod(now);
    res.json(period);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    await autoCloseExpiredPeriods(new Date());
    const periods = await RegistrationPeriod.find().sort({ startDate: -1 });
    res.json(periods);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    await autoCloseExpiredPeriods(new Date());
    const { name, startDate, endDate, note } = req.body;
    const period = await RegistrationPeriod.create({ name, startDate, endDate, note });
    res.status(201).json(period);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    await autoCloseExpiredPeriods(new Date());
    const { name, startDate, endDate, note, isActive } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (startDate !== undefined) updates.startDate = startDate;
    if (endDate !== undefined) updates.endDate = endDate;
    if (note !== undefined) updates.note = note;
    if (isActive !== undefined) updates.isActive = !!isActive;

    // Chỉ một đợt được "bật" cùng lúc — tránh admin bật nhầm nhiều đợt.
    if (updates.isActive === true) {
      await RegistrationPeriod.updateMany({ _id: { $ne: req.params.id } }, { $set: { isActive: false } });
    }

    const period = await RegistrationPeriod.findByIdAndUpdate(req.params.id, updates, { returnDocument: 'after' });
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
