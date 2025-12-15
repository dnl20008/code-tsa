const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const app = express();

// Cấu hình
app.use(cors()); // Cho phép Frontend gọi vào
app.use(bodyParser.json());

// Hàm đọc/ghi dữ liệu (Giả lập Database)
const DB_FILE = './data.json';
function getDB() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Cấu hình giá tiền (Để check bảo mật)
const PRICE_PER_CODE = 25000;

// API 1: WEBHOOK (Nhận tín hiệu từ SePay khi có tiền về)
app.post('/webhook-sepay', (req, res) => {
    const data = req.body; // Dữ liệu SePay gửi sang
    
    // SePay gửi các trường: transactionDate, content, transferAmount...
    const content = data.content; // Nội dung CK (Ví dụ: TSA8812)
    const amount = data.transferAmount; // Số tiền

    console.log(`[BANK] Nhận giao dịch: ${amount}đ - Nội dung: ${content}`);

    // Logic xử lý đơn hàng
    // Tìm xem nội dung CK có chứa mã đơn hàng nào không (VD: TSA...)
    const db = getDB();
    
    // Tách mã đơn hàng từ nội dung (Giả sử mã đơn là chuỗi bắt đầu bằng TSA + số)
    // Ví dụ content: "MBVCB.1234.TSA9999" -> Cần lấy "TSA9999"
    const match = content.match(/(TSA\d+)/);
    
    if (match) {
        const orderID = match[0]; // TSA9999
        
        // Kiểm tra xem đơn hàng này đã xử lý chưa
        if (!db.orders[orderID]) {
            // Tính số lượng mua dựa trên số tiền
            const qty = Math.floor(amount / PRICE_PER_CODE);
            
            if (qty > 0 && db.stock.length >= qty) {
                // Lấy code từ kho
                const codesToSend = db.stock.splice(0, qty); // Cắt code ra khỏi kho
                
                // Lưu đơn hàng thành công
                db.orders[orderID] = {
                    status: 'paid',
                    amount: amount,
                    codes: codesToSend,
                    time: new Date().toISOString()
                };
                
                saveDB(db); // Lưu lại Database
                console.log(`[SUCCESS] Đã trả ${qty} code cho đơn ${orderID}`);
            } else {
                console.log(`[FAIL] Kho hết code hoặc tiền không đủ.`);
            }
        }
    }

    res.json({ success: true }); // Báo lại cho SePay là đã nhận
});

// API 2: FRONTEND GỌI ĐỂ KIỂM TRA TRẠNG THÁI
app.get('/check-order/:orderID', (req, res) => {
    const orderID = req.params.orderID;
    const db = getDB();
    
    if (db.orders[orderID]) {
        res.json({ 
            status: 'success', 
            data: db.orders[orderID] 
        });
    } else {
        res.json({ status: 'pending' });
    }
});

// API 3: LẤY SỐ LƯỢNG TỒN KHO
app.get('/stock', (req, res) => {
    const db = getDB();
    res.json({ count: db.stock.length });
});

// Chạy Server tại cổng 3000
// Cập nhật dòng app.listen cũ thành đoạn này:
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại port ${PORT}`);
});