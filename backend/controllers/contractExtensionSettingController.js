const ContractExtensionSetting = require("../models/ContractExtensionSetting");

const SETTING_KEY = "contract_extension";

exports.getContractExtensionSetting = async (req, res) => {
  try {
    const doc = await ContractExtensionSetting.findOne({ key: SETTING_KEY });
    res.json({ enable_contract_extension: doc?.enable_contract_extension ?? true });
  } catch (error) {
    res.status(500).json({ message: error.message || "Lỗi khi tải setting" });
  }
};

exports.setContractExtensionSetting = async (req, res) => {
  try {
    const { enable_contract_extension } = req.body || {};
    if (typeof enable_contract_extension !== "boolean") {
      return res.status(400).json({ message: "enable_contract_extension phải là boolean" });
    }

    const doc = await ContractExtensionSetting.findOneAndUpdate(
      { key: SETTING_KEY },
      { $set: { enable_contract_extension } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true },
    );

    res.json({ enable_contract_extension: doc.enable_contract_extension });
  } catch (error) {
    res.status(500).json({ message: error.message || "Lỗi khi cập nhật setting" });
  }
};

