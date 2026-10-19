ROUTER PROBLEM REPORT PLATFORM

index.html = หน้าเลือกโหมด ไม่ต้องกรอกชื่อผู้ใช้/รหัสผ่าน
work/ = ระบบรายงานปัญหางานจากไฟล์เวอร์ชันล่าสุด พร้อมบังคับผู้รายงานและ Supervisor และรองรับแนบรูป/ถ่ายรูปตามระบบเดิม
machine/ = ระบบรายงานเครื่องจักรแยกหน้าแดชบอร์ด, ลงข้อมูล, กราฟสรุป, รายการ; มีเวลาเริ่ม-จบคำนวณ downtime, รูปหลายรูป/กล้องมือถือ, ดู/แก้ไข/ลบ, CSV/JSON/พิมพ์

Firebase: system-routerf2; machine node = machine_reports. ต้องเปิด Authentication > Sign-in method > Anonymous และตั้ง Realtime Database Rules ให้อ่าน/เขียนสำหรับ auth != null จึงซิงค์ข้ามเครื่องได้. ตรวจสอบนโยบายสิทธิ์ก่อนเผยแพร่ เพราะผู้ใช้ anonymous ที่ผ่าน auth อาจแก้ไข/ลบข้อมูลได้ตาม rules.

ข้อควรทราบ: โหมดรายงานงานใช้โครงสร้าง Firebase/Storage เดิมจาก app.js และการเข้าแบบ anonymous; ควรทดสอบใน Firebase project ก่อนใช้งานจริง. Static files ต้องอัปโหลดไป Firebase Hosting หรือ static hosting จึงจะออนไลน์; ZIP ไม่ได้เผยแพร่เว็บให้อัตโนมัติ.
