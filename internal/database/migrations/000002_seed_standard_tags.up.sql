INSERT INTO tags (code, name_vi, name_zh, name_en, category, use_count, is_preset) VALUES
-- 1S: Sàng lọc (Seiri) - Loại bỏ những gì không cần thiết
('scrap_material', 'Phế liệu / Rác thải sản xuất tồn đọng', '多余废料 / 生产废品', 'Scrap material / Excess scrap', '1S', 1, TRUE),
('unneeded_tools', 'Dụng cụ, khuôn gá thừa không dùng', '闲置工具 / 多余夹具', 'Unneeded / Idle tools & jigs', '1S', 1, TRUE),
('expired_chemical', 'Hóa chất, keo, dầu mỡ quá hạn sử dụng', '过期化学品 / 胶水油脂', 'Expired chemical / Glue & oil', '1S', 1, TRUE),
('broken_equipment', 'Máy móc, pallet hỏng chờ thanh lý', '损坏设备 / 报废托盘', 'Broken equipment / Broken pallet', '1S', 1, TRUE),
('stagnant_wip', 'Bán thành phẩm ứ đọng ngoài kế hoạch', '呆滞在制品 / 超量堆积', 'Stagnant WIP / Excess buffer', '1S', 1, TRUE),
('excess_inventory', 'Vật tư, linh kiện tồn quá định mức', '物料超额积压 / 呆滞料', 'Excess inventory / Overstocked parts', '1S', 1, TRUE),
('unused_furniture', 'Bàn ghế, tủ kệ cũ hỏng không sử dụng', '闲置桌椅 / 破损货架', 'Unused or broken furniture', '1S', 1, TRUE),
('expired_sample', 'Mẫu thử nghiệm, cữ mẫu cũ quá hạn', '过期样板 / 作废样品', 'Expired sample / Outdated template', '1S', 1, TRUE),
('obsolete_documents', 'Giấy tờ, bản vẽ, hồ sơ cũ không dùng', '作废图纸 / 过期文件', 'Obsolete documents / Old drawings', '1S', 1, TRUE),

-- 2S: Sắp xếp (Seiton) - Định vị, định lượng, ngăn nắp
('blocked_aisle', 'Vật cản chắn lối đi / Cửa thoát hiểm', '堵塞通道 / 逃生门受阻', 'Blocked aisle / Exit blocked', '2S', 1, TRUE),
('missing_demarcation', 'Thiếu hoặc mờ vạch kẻ định vị sàn', '缺少定位线 / 标线脱落', 'Missing demarcation line', '2S', 1, TRUE),
('wrong_tool_place', 'Để dụng cụ, thiết bị sai vị trí quy định', '工具用后未归位 / 乱放', 'Misplaced tool / Wrong storage', '2S', 1, TRUE),
('tangled_cables', 'Dây điện, ống hơi, dây cáp lòng thòng', '线缆气管杂乱 / 缠绕', 'Tangled cables & air hoses', '2S', 1, TRUE),
('unlabeled_container', 'Khay hộp, thùng chứa không ghi rõ tên', '周转箱无标识 / 混装', 'Unlabeled container / Box', '2S', 1, TRUE),
('stack_too_high', 'Xếp hàng, pallet quá cao mất thăng bằng', '货物码放超高 / 倾斜', 'Stacked too high / Unstable stack', '2S', 1, TRUE),
('mixed_materials', 'Vật tư khác loại để lẫn lộn trong khay', '不同物料混放 / 无隔离', 'Mixed materials / Commingled parts', '2S', 1, TRUE),
('no_max_min_mark', 'Kệ hàng thiếu vạch mức Max/Min tồn kho', '货架缺少高低限标识', 'Missing Max/Min stock mark', '2S', 1, TRUE),
('cart_outside_parking', 'Xe đẩy, xe nâng để ngoài ô đỗ quy định', '手推车未停放在划线区', 'Cart/forklift parked outside bay', '2S', 1, TRUE),
('cleaning_tool_misplaced', 'Chổi, cây lau nhà vứt sai nơi quy định', '清扫工具乱放 / 未悬挂', 'Cleaning tools misplaced / unhung', '2S', 1, TRUE),

-- 3S: Sạch sẽ (Seiso) - Vệ sinh và kiểm tra máy móc
('oil_leak', 'Rò rỉ dầu mỡ máy móc xuống sàn', '设备漏油 / 润滑油泄漏', 'Machine oil / Grease leak', '3S', 1, TRUE),
('dust_accumulation', 'Bụi bẩn bám dầy trên máy / đường ống', '设备积尘 / 管道严重积垢', 'Heavy dust / Dirt accumulation', '3S', 1, TRUE),
('trash_overflow', 'Thùng rác đầy tràn / Không phân loại rác', '垃圾桶溢出 / 未分类投放', 'Trash overflow / Mixed waste', '3S', 1, TRUE),
('scattered_trash', 'Rác, vụn vải, mạt kim loại rơi vãi trên sàn', '垃圾杂物散落 / 地面碎屑', 'Scattered trash / Floor debris & scrap', '3S', 1, TRUE),
('water_leak', 'Rò rỉ nước làm mát / Sàn ẩm mốc trơn', '冷却水泄漏 / 管道渗水', 'Water leak / Damp slippery area', '3S', 1, TRUE),
('dirty_workstation', 'Bàn thao tác dính bẩn / Vụn kim loại thừa', '工作台脏污 / 残留碎屑', 'Dirty workstation / Metal chips', '3S', 1, TRUE),
('dirty_light_fixtures', 'Bóng đèn, máng đèn bám bụi tối mờ', '灯具积灰 / 照度不足', 'Dirty light fixtures / Dim lighting', '3S', 1, TRUE),
('stained_floor', 'Vết ố bẩn, vệt bánh xe kéo dài trên sàn', '地面油斑污迹 / 叉车印', 'Stained floor / Tire skid marks', '3S', 1, TRUE),
('dirty_electrical_panel', 'Tủ điện bám bụi bẩn, mạng nhện', '配电箱积尘 / 蛛网杂物', 'Dirty electrical cabinet / Cobwebs', '3S', 1, TRUE),
('clogged_drain', 'Rãnh thoát nước nghẹt rác bốc mùi', '地沟堵塞 / 排水不畅有异味', 'Clogged drainage / Standing foul water', '3S', 1, TRUE),

-- 4S: Săn sóc (Seiketsu) - Chuẩn hóa và duy trì tiêu chuẩn
('missing_label', 'Mất bảng tên máy / Nhãn thiết bị mờ', '缺少设备标牌 / 铭牌脱落', 'Missing machine label / Tag', '4S', 1, TRUE),
('broken_gauge', 'Đồng hồ áp suất / Nhiệt kế mờ, hỏng kim', '压力表损坏 / 仪表无界限', 'Broken gauge / Missing limit line', '4S', 1, TRUE),
('outdated_notice', 'Bảng tin, checklist bảo dưỡng quá hạn', '点检表未更新 / 看板过期', 'Outdated checklist / Notice board', '4S', 1, TRUE),
('faded_standard', 'Mất hướng dẫn công việc (SOP/WI)', '缺少作业指导书 / 破损', 'Missing or faded SOP / WI', '4S', 1, TRUE),
('damaged_pipe_color', 'Sơn phân biệt màu đường ống bị bong tróc', '管道流向色标脱落 / 褪色', 'Damaged pipe color code / Arrow', '4S', 1, TRUE),
('missing_calibration', 'Thiết bị đo kiểm hết hạn hiệu chuẩn', '量具过期未校验 / 缺绿标', 'Measurement tool expired calibration', '4S', 1, TRUE),
('torn_safety_sign', 'Biển cảnh báo nguy hiểm rách mờ', '安全警示标识破损 / 缺失', 'Torn / Missing safety warning sign', '4S', 1, TRUE),
('unauthorized_mod', 'Tự ý câu nối dây / Thay đổi kết cấu máy', '私自拉线接线 / 擅改设备', 'Unauthorized wiring / Modification', '4S', 1, TRUE),

-- 5S: Sẵn sàng (Shitsuke) - Kỷ luật và văn hóa tự giác
('ppe_violation', 'Không tuân thủ trang phục, thẻ, nón bảo hộ', '未按规着装 / 穿戴不整', 'Inappropriate attire / Badge missing', '5S', 1, TRUE),
('improper_storage', 'Không đậy nắp thùng hóa chất / Bình chứa', '化学品未加盖 / 用后未封', 'Uncapped container / Open lid', '5S', 1, TRUE),
('sop_noncompliance', 'Bỏ bước kiểm tra / Không tuân thủ quy trình', '违规作业 / 未按标准操作', 'SOP non-compliance / Shortcut', '5S', 1, TRUE),
('eating_at_workstation', 'Ăn uống, hút thuốc sai khu vực quy định', '工位吃喝 / 乱扔烟蒂', 'Eating/drinking at workstation', '5S', 1, TRUE),
('sleeping_on_shift', 'Ngủ trong giờ làm việc / Rời bỏ vị trí', '上班睡觉 / 脱岗串岗', 'Sleeping during shift / Abandoning post', '5S', 1, TRUE),
('phone_use_operating', 'Sử dụng điện thoại khi vận hành máy', '操作设备时看手机', 'Using phone while operating machine', '5S', 1, TRUE),
('running_in_workshop', 'Chạy nhảy, đùa giỡn trong xưởng sản xuất', '车间内奔跑打闹', 'Running or horseplay in workshop', '5S', 1, TRUE),

-- 6S: An toàn (Safety) - Nguy cơ rủi ro & khẩn cấp
('safety_gear', 'Thiếu đồ bảo hộ an toàn bắt buộc (PPE)', '未穿戴必需劳保 (PPE)', 'Missing mandatory PPE', '6S', 1, TRUE),
('fire_hazard', 'Che chắn tủ cứu hỏa / Nguy cơ cháy nổ', '消防栓受阻 / 易燃隐患', 'Fire equipment blocked / Fire hazard', '6S', 1, TRUE),
('exposed_wire', 'Hở dây điện / Tủ điện không khóa / Đứt tiếp địa', '电线裸露 / 配电箱未锁', 'Exposed live wire / Unlocked panel', '6S', 1, TRUE),
('slippery_floor', 'Sàn trơn trợt / Vũng nước dễ ngã', '地面湿滑 / 易滑倒摔伤', 'Slippery floor / Slip hazard', '6S', 1, TRUE),
('missing_machine_guard', 'Tháo nắp chắn an toàn / Hỏng sensor bảo vệ', '拆除防护罩 / 光栅失效', 'Missing safety guard / Interlock', '6S', 1, TRUE),
('chemical_spill', 'Tràn đổ hóa chất nguy hiểm chưa xử lý', '危险化学品泄漏 / 挥发', 'Chemical spill / Toxic hazard', '6S', 1, TRUE),
('emergency_stop_fault', 'Nút dừng khẩn cấp (E-Stop) kẹt hoặc hỏng', '急停按钮卡死 / 失灵', 'Emergency stop faulty / Obstructed', '6S', 1, TRUE),
('broken_ladder_scaffold', 'Thang gấp, giàn giáo hỏng không an toàn', '损坏梯子 / 脚手架无护栏', 'Broken ladder / Unsafe scaffold', '6S', 1, TRUE),
('gas_cylinder_unsecured', 'Bình khí nén, bình gas không xích cố định', '气瓶未固定 / 倒地隐患', 'Unsecured gas cylinder / Falling risk', '6S', 1, TRUE),
('forklift_speeding', 'Xe nâng chạy quá tốc độ / Không bấm còi ngã tư', '叉车超速 / 转弯未鸣笛', 'Forklift speeding / No horn at corner', '6S', 1, TRUE),
('overloaded_socket', 'Ổ cắm điện cắm quá tải / Cháy xém', '插座超负荷 / 烧焦痕迹', 'Overloaded electrical outlet / Scorched', '6S', 1, TRUE)
ON CONFLICT (code) DO UPDATE SET
    name_vi = EXCLUDED.name_vi,
    name_zh = EXCLUDED.name_zh,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category,
    is_preset = EXCLUDED.is_preset;
