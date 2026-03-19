const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    fullName: { type: String, required: true },
    phone: { type: String, default: "" },
    studentId: { type: String, default: "" },
    dateOfBirth: { type: Date, default: null },
    address: { type: String, default: "" },
    role: { type: String, enum: ["admin", "manager", "user"], default: "user" },
    avatar: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    managedArea: { type: mongoose.Schema.Types.ObjectId, ref: "Area", default: null },
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
