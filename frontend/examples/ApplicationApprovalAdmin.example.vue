<!--
  Ví dụ Vue 3 + Bootstrap 5 cho cùng REST API `/api/applications`.
  Copy sang dự án Vue (Vite/CLI), cài axios & bootstrap, cấu hình baseURL + Bearer token.
-->
<template>
  <div class="container-fluid">
    <h4 class="mb-3">Xét duyệt đơn KTX</h4>
    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div class="table-responsive">
      <table class="table table-sm table-bordered">
        <thead>
          <tr>
            <th>Sinh viên</th>
            <th>Ngày</th>
            <th>Trạng thái</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in applications" :key="a._id">
            <td>{{ a.user?.fullName }}</td>
            <td>{{ formatDate(a.createdAt) }}</td>
            <td>
              <span v-if="a.status === 'pending'" class="badge text-bg-warning">Chờ duyệt</span>
              <span v-else-if="a.status === 'approved'" class="badge text-bg-success">Đã duyệt</span>
              <span v-else class="badge text-bg-danger">Từ chối</span>
            </td>
            <td>
              <button v-if="a.status === 'pending'" class="btn btn-success btn-sm me-1" @click="approve(a._id)">Duyệt</button>
              <button v-if="a.status === 'pending'" class="btn btn-danger btn-sm" @click="openReject(a._id)">Từ chối</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="rejectId" class="modal fade show d-block" style="background: rgba(0,0,0,.45)">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header"><h5 class="modal-title">Lý do từ chối</h5></div>
          <div class="modal-body">
            <textarea v-model="rejectNote" class="form-control" rows="3" />
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="rejectId = null">Hủy</button>
            <button class="btn btn-danger" @click="reject">Xác nhận</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import axios from "axios";

const API = "/api"; // TODO: base URL
const token = () => localStorage.getItem("token") || "";

const applications = ref([]);
const error = ref("");
const rejectId = ref(null);
const rejectNote = ref("");

function formatDate(s) {
  return s ? new Date(s).toLocaleString("vi-VN") : "—";
}

async function load() {
  error.value = "";
  try {
    const { data } = await axios.get(`${API}/applications`, {
      headers: { Authorization: `Bearer ${token()}` },
      params: { page: 1, limit: 20, sortOrder: "desc" },
    });
    applications.value = data.applications || [];
  } catch (e) {
    error.value = e.response?.data?.message || "Lỗi tải";
  }
}

async function approve(id) {
  await axios.patch(`${API}/applications/${id}/approve`, {}, { headers: { Authorization: `Bearer ${token()}` } });
  await load();
}

function openReject(id) {
  rejectId.value = id;
  rejectNote.value = "";
}

async function reject() {
  await axios.patch(
    `${API}/applications/${rejectId.value}/reject`,
    { note: rejectNote.value },
    { headers: { Authorization: `Bearer ${token()}` } }
  );
  rejectId.value = null;
  await load();
}

onMounted(load);
</script>
