const mongoose = require("mongoose");

const contractExtensionSettingSchema = new mongoose.Schema(
  {
    // Singleton setting: luôn chỉ có 1 document ứng với key này.
    key: { type: String, required: true, unique: true },
    enable_contract_extension: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("ContractExtensionSetting", contractExtensionSettingSchema);

