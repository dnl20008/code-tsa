const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- CẤU HÌNH (ĐÃ GIỮ NGUYÊN LINK CỦA BẠN) ---
const MONGO_URI = "mongodb+srv://admin:f7K3ZWVXxkxBK389@cluster0.wptvqv8.mongodb.net/?appName=Cluster0";

console.log("⏳ Đang thử kết nối MongoDB...");

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ KẾT NỐI MONGODB THÀNH CÔNG!"))
  .catch(err => {
      console.error("❌ LỖI KẾT NỐI MONGODB:", err.message);
      console.log("⚠️ Gợi ý: Hãy vào MongoDB Atlas > Network Access > Thêm IP 0.0.0.0/0");
  });

// --- SCHEMA (CẤU TRÚC DỮ LIỆU) ---
const CodeSchema = new mongoose.Schema({ value: String });
const CodeModel = mongoose.model('Code', CodeSchema);

const OrderSchema = new mongoose.Schema({
    orderID: String,
    email: { type: String, default: '' }, // Đã thêm trường Email
    amount: Number,
    codes: [String],
    status: String, // 'pending' (chờ) hoặc 'paid' (xong)
    createdAt: { type: Date, default: Date.now }
});
const OrderModel = mongoose.model('Order', OrderSchema);

const PRICE_PER_CODE = 25000;

// --- API 1: LƯU ĐƠN HÀNG CHỜ (Để lưu Email trước khi khách thanh toán) ---
app.post('/create-order', async (req, res) => {
    try {
        const { orderID, email } = req.body;
        // Tìm và cập nhật hoặc tạo mới đơn hàng ở trạng thái chờ
        await OrderModel.findOneAndUpdate(
            { orderID: orderID },
            { orderID, email, status: 'pending', amount: 0, codes: [] },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (e) {
        console.log("Lỗi tạo đơn chờ:", e.message);
        res.json({ success: false });
    }
});

// --- API 2: WEBHOOK SEPAY (XỬ LÝ KHI TIỀN VỀ) ---
app.post('/webhook-sepay', async (req, res) => {
    console.log("------------------------------------------------");
    console.log("📩 NHẬN ĐƯỢC TIN NHẮN TỪ SEPAY!");
    
    try {
        const data = req.body;
        console.log("📦 Dữ liệu:", JSON.stringify(data));

        const content = data.content; 
        const amount = data.transferAmount;

        // 1. Tìm mã đơn (TSA...)
        const match = content.match(/(TSA\d+)/);
        if (!match) {
            console.log("❌ Không tìm thấy mã đơn (TSA...)");
            return res.json({ success: false, reason: "No Order ID found" });
        }

        const orderID = match[0];
        console.log(`🔍 Mã đơn: ${orderID} - Tiền: ${amount}`);

        // 2. Tìm đơn hàng (Có thể đã được tạo lúc nhập email)
        let order = await OrderModel.findOne({ orderID: orderID });

        // Nếu đơn hàng chưa tồn tại (Khách quên nhập email mà ck luôn) -> Tạo mới
        if (!order) {
            order = new OrderModel({ orderID, status: 'pending' });
        }

        // 3. Nếu đơn chưa thanh toán thì xử lý
        if (order.status !== 'paid') {
            const qty = Math.floor(amount / PRICE_PER_CODE);
            console.log(`🧮 Khách mua ${qty} mã.`);

            if (qty > 0) {
                const codesToSend = [];
                for (let i = 0; i < qty; i++) {
                    const codeItem = await CodeModel.findOneAndDelete();
                    if (codeItem) codesToSend.push(codeItem.value);
                }

                if (codesToSend.length > 0) {
                    order.amount = amount;
                    order.codes = codesToSend;
                    order.status = 'paid';
                    await order.save(); // Lưu lại
                    console.log(`✅ THÀNH CÔNG! Mã: ${codesToSend.join(', ')}`);
                } else {
                    console.log("❌ KHO HẾT CODE RỒI!");
                }
            } else {
                console.log("❌ Tiền không đủ mua 1 mã.");
            }
        } else {
            console.log("⚠️ Đơn này đã xử lý rồi.");
        }

        res.json({ success: true });

    } catch (e) {
        console.error("❌ LỖI WEBHOOK:", e.message);
        res.json({ success: false });
    }
});

// --- CÁC API PHỤ TRỢ ---
app.get('/', (req, res) => res.send("Server đang chạy ngon lành!"));

app.get('/stock', async (req, res) => {
    try {
        const count = await CodeModel.countDocuments();
        res.json({ count: count });
    } catch (e) { res.json({ count: 0 }); }
});

app.get('/check-order/:orderID', async (req, res) => {
    try {
        const order = await OrderModel.findOne({ orderID: req.params.orderID });
        if (order && order.status === 'paid') {
            res.json({ status: 'success', data: order });
        } else {
            res.json({ status: 'pending' });
        }
    } catch (e) { res.json({ status: 'error' }); }
});

app.get('/add-codes', async (req, res) => {
    try {
        const listRaw = req.query.codes;
        if (!listRaw) return res.send("Thiếu ?codes=...");
        const listArray = listRaw.split(',').map(c => ({ value: c.trim() }));
        await CodeModel.insertMany(listArray);
        res.send(`Đã thêm ${listArray.length} code.`);
    } catch (e) { res.send("Lỗi: " + e.message); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server đang chạy tại port ${PORT}`));
