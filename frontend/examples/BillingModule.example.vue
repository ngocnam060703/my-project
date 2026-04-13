<!-- Vue 3 + Bootstrap 5 — gọi cùng API /api/bills (Bearer token). -->
<template>
  <div class="container">
    <h4>Hóa đơn</h4>
    <table class="table table-sm">
      <tbody>
        <tr v-for="b in bills" :key="b._id">
          <td>{{ b.month }}/{{ b.year }}</td>
          <td class="text-end">{{ b.total?.toLocaleString("vi-VN") }}đ</td>
          <td><span class="badge" :class="badgeClass(b.status)">{{ b.status }}</span></td>
          <td><button v-if="canPay(b.status)" class="btn btn-success btn-sm" @click="pay(b._id)">Pay</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<script setup>
import { ref, onMounted } from "vue";
import axios from "axios";
const bills = ref([]);
const token = () => localStorage.getItem("token") || "";
const canPay = (s) => s === "unpaid" || s === "pending" || s === "overdue";
const badgeClass = (s) => ({ paid: "text-bg-success", overdue: "text-bg-danger" }[s] || "text-bg-warning");
async function load() {
  const { data } = await axios.get("/api/bills/my", { headers: { Authorization: `Bearer ${token()}` } });
  bills.value = data || [];
}
async function pay(id) {
  await axios.put(`/api/bills/${id}/pay-online`, {}, { headers: { Authorization: `Bearer ${token()}` } });
  await load();
}
onMounted(load);
</script>
