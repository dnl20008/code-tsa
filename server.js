const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- CẤU HÌNH ---
// HÃY KIỂM TRA KỸ LẠI MẬT KHẨU TRONG LINK NÀY
const MONGO_URI = "mongodb+srv://admin:f7K3ZWVXxkxBK389@cluster0.wptvqv8.mongodb.net/?appName=Cluster0";

console.log("⏳ Đang thử kết nối MongoDB...");

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ KẾT NỐI MONGODB THÀNH CÔNG!"))
  .catch(err => {
      console.error("❌ LỖI KẾT NỐI MONGODB:", err.message);
      console.log("⚠️ Gợi ý: Hãy vào MongoDB Atlas > Network Access > Thêm IP 0.0.0.0/0");
  });

// Schema
const CodeSchema = new mongoose.Schema({ value: String });
const CodeModel = mongoose.model('Code', CodeSchema);

const OrderSchema = new mongoose.Schema({
    orderID: String,
    amount: Number,
    codes: [String],
    status: String,
    createdAt: { type: Date, default: Date.now }
});
const OrderModel = mongoose.model('Order', OrderSchema);

const PRICE_PER_CODE = 25000;

// API TEST
app.get('/', (req, res) => {
    res.send("Server đang chạy ngon lành!");
});

// API NẠP CODE
app.get('/add-codes', async (req, res) => {
    try {
        const listRaw = req.query.codes;
        if (!listRaw) return res.send("Thiếu ?codes=...");
        const listArray = listRaw.split(',').map(c => ({ value: c.trim() }));
        await CodeModel.insertMany(listArray);
        res.send(`Đã thêm ${listArray.length} code.`);
    } catch (e) { res.send("Lỗi: " + e.message); }
});

app.get('/stock', async (req, res) => {
    try {
        const count = await CodeModel.countDocuments();
        res.json({ count: count });
    } catch (e) { res.json({ count: 0 }); }
});

// --- WEBHOOK SEPAY (DEBUG VERSION) ---
app.post('/webhook-sepay', async (req, res) => {
    console.log("------------------------------------------------");
    console.log("📩 NHẬN ĐƯỢC TIN NHẮN TỪ SEPAY!");
    
    try {
        const data = req.body;
        console.log("📦 Dữ liệu nhận được:", JSON.stringify(data));

        const content = data.content; 
        const amount = data.transferAmount;

        // 1. Tìm mã đơn
        const match = content.match(/(TSA\d+)/);
        if (!match) {
            console.log("❌ Không tìm thấy mã đơn (TSA...) trong nội dung chuyển khoản.");
            return res.json({ success: false, reason: "No Order ID found" });
        }

        const orderID = match[0];
        console.log(`🔍 Phát hiện mã đơn: ${orderID} - Số tiền: ${amount}`);

        // 2. Check trùng đơn
        const existOrder = await OrderModel.findOne({ orderID: orderID });
        if (existOrder) {
            console.log("⚠️ Đơn này đã xử lý rồi. Bỏ qua.");
            return res.json({ success: true, message: "Order already processed" });
        }

        // 3. Xử lý kho
        const qty = Math.floor(amount / PRICE_PER_CODE);
        console.log(`🧮 Khách mua ${qty} mã.`);

        if (qty > 0) {
            const codesToSend = [];
            for (let i = 0; i < qty; i++) {
                const codeItem = await CodeModel.findOneAndDelete();
                if (codeItem) codesToSend.push(codeItem.value);
            }

            if (codesToSend.length > 0) {
                await OrderModel.create({
                    orderID: orderID,
                    amount: amount,
                    status: 'paid',
                    codes: codesToSend
                });
                console.log(`✅ THÀNH CÔNG! Đã lưu đơn hàng. Mã gửi đi: ${codesToSend.join(', ')}`);
            } else {
                console.log("❌ KHO HẾT CODE RỒI!");
            }
        } else {
            console.log("❌ Số tiền không đủ mua 1 mã.");
        }

        res.json({ success: true });

    } catch (e) {
        console.error("❌ LỖI CODE XỬ LÝ:", e.message);
        res.json({ success: false });
    }
});

// API CHECK
app.get('/check-order/:orderID', async (req, res) => {
    try {
        const order = await OrderModel.findOne({ orderID: req.params.orderID });
        if (order) {
            res.json({ status: 'success', data: order });
        } else {
            res.json({ status: 'pending' });
        }
    } catch (e) {
        console.error("Lỗi Check Order:", e.message);
        res.json({ status: 'error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server đang chạy tại port ${PORT}`));

