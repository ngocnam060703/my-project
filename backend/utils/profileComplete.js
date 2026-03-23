/**
 * Các trường bắt buộc để coi hồ sơ sinh viên là "đầy đủ".
 */
const REQUIRED_STUDENT_FIELDS = [
  "fullName",
  "studentId",
  "className",
  "major",
  "gender",
  "phone",
  "address",
  "citizenId",
];

// Điều kiện tối thiểu để được phép gửi đơn đăng ký nội trú.
const REQUIRED_DORM_REGISTRATION_FIELDS = [
  "studentId",
  "fullName",
  "gender",
  "phone",
  "address",
  "major",
];

function isProfileComplete(user) {
  if (!user) return false;
  if (!user.dateOfBirth) return false;
  return REQUIRED_STUDENT_FIELDS.every((k) => {
    const v = user[k];
    return v != null && String(v).trim() !== "";
  });
}

function hasDormRegistrationProfile(user) {
  if (!user) return false;
  return REQUIRED_DORM_REGISTRATION_FIELDS.every((k) => {
    const v = user[k];
    return v != null && String(v).trim() !== "";
  });
}

module.exports = {
  isProfileComplete,
  REQUIRED_STUDENT_FIELDS,
  hasDormRegistrationProfile,
  REQUIRED_DORM_REGISTRATION_FIELDS,
};
