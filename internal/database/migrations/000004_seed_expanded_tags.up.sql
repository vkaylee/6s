-- Migration: 000004_seed_expanded_tags.up.sql
-- Expand 6S tags library to ~150 comprehensive industrial tags (Injection molding, SMT, Logistics, Mechanical, Garment, Chemical)

INSERT INTO tags (code, name_vi, name_zh, name_en, category, use_count, is_preset, is_active) VALUES
-- ============================================================================
-- 1S: SÀNG LỌC (SEIRI) - Bổ sung các loại phế phẩm, mẫu cũ, linh kiện ứ đọng
-- ============================================================================
('damaged_cartons', 'Thùng carton rách hỏng, bẹp nát trong kho', '破损纸箱 / 压溃包装', 'Damaged or crushed cartons', '1S', 1, TRUE, TRUE),
('rusted_materials', 'Kim loại rỉ sét để lẫn hàng đạt chuẩn', '生锈物料 / 氧化零件', 'Rusted metal / Corroded materials', '1S', 1, TRUE, TRUE),
('expired_solder_paste', 'Kem hàn, keo bạc quá hạn sử dụng (SMT)', '过期锡膏 / 固晶胶过期', 'Expired solder paste / Epoxy adhesive', '1S', 1, TRUE, TRUE),
('broken_fixtures', 'Đồ gá, jig thử nghiệm nứt vỡ chờ hủy', '断裂治具 / 报废夹具', 'Cracked fixtures / Scrapped jigs', '1S', 1, TRUE, TRUE),
('empty_drums_uncollected', 'Phuy rỗng, can hóa chất hết chưa thu hồi', '空化学桶未回收 / 占道', 'Empty chemical drums uncollected', '1S', 1, TRUE, TRUE),
('obsolete_labels', 'Tem nhãn mã vạch cũ in lỗi, sai phiên bản', '作废标签 / 错版条码', 'Obsolete or misprinted barcode labels', '1S', 1, TRUE, TRUE),
('unused_cables_wires', 'Dây điện vụn, cáp mạng thừa bỏ bừa bãi', '废弃电线 / 闲置网线', 'Unused wire scraps & discarded cables', '1S', 1, TRUE, TRUE),
('expired_tape_film', 'Băng dính, màng PE hỏng keo biến chất', '老化胶带 / 变质保护膜', 'Degraded adhesive tape / Expired PE film', '1S', 1, TRUE, TRUE),
('broken_plastic_bins', 'Khay nhựa, rổ đựng linh kiện nứt vỡ', '碎裂塑料筐 / 破损周转箱', 'Broken plastic bins / Cracked totes', '1S', 1, TRUE, TRUE),
('scrapped_printed_circuit', 'Bo mạch lỗi (PCB) hủy chưa chuyển kho phế', '报废电路板 (PCB) 堆积', 'Scrapped PCB boards piled up', '1S', 1, TRUE, TRUE),
('contaminated_rags', 'Giẻ lau dính hóa chất chưa bỏ thùng quy định', '含油废抹布乱扔', 'Chemical-contaminated rags discarded', '1S', 1, TRUE, TRUE),
('abandoned_projects', 'Máy chế thử, dự án cũ bỏ xó chiếm diện tích', '闲置样机 / 废弃实验设备', 'Abandoned prototypes occupying workspace', '1S', 1, TRUE, TRUE),
('expired_ppe_stock', 'Đồ bảo hộ, khẩu trang hỏng mốc trong kho', '发霉口罩 / 过期劳保物资', 'Moldy or expired PPE supplies', '1S', 1, TRUE, TRUE),
('excess_packing_foam', 'Mút xốp chống sốc dư thừa rải rác', '多余泡沫棉 / 珍珠棉散落', 'Excess packaging foam & bubble wrap', '1S', 1, TRUE, TRUE),
('scrap_injection_runner', 'Cuống nhựa thừa, phôi ép lỗi tràn khay', '注塑水口料堆积 / 废料溢出', 'Excess injection molding runners & sprues', '1S', 1, TRUE, TRUE),

-- ============================================================================
-- 2S: SẮP XẾP (SEITON) - Định vị, nhãn chỉ dẫn, thứ tự ngăn nắp
-- ============================================================================
('missing_shadow_board', 'Bảng bóng (Shadow board) thiếu dụng cụ', '工具影画板缺少工具', 'Shadow board missing tools', '2S', 1, TRUE, TRUE),
('unmarked_first_aid', 'Hộp sơ cứu không có biển chỉ dẫn vị trí', '急救箱无明显定位指示', 'Unmarked first aid kit location', '2S', 1, TRUE, TRUE),
('fire_extinguisher_unmarked', 'Bình cứu hỏa thiếu vạch kẻ định vị sàn', '灭火器未划线定位', 'Fire extinguisher missing floor mark', '2S', 1, TRUE, TRUE),
('pallet_protruding_aisle', 'Pallet để lồi ra ngoài vạch kẻ lối đi', '托盘超出通道划线 / 压线', 'Pallet protruding past aisle demarcation', '2S', 1, TRUE, TRUE),
('missing_fifo_order', 'Hàng nhập trước xuất sau, vi phạm FIFO', '未按先进先出 (FIFO) 摆放', 'Violation of FIFO storage sequence', '2S', 1, TRUE, TRUE),
('unlabeled_pipeline_valves', 'Van đường ống khí/nước không nhãn đóng mở', '阀门无开闭方向与介质标识', 'Pipeline valve missing open/close label', '2S', 1, TRUE, TRUE),
('tools_stacked_unstable', 'Dụng cụ kim khí xếp chồng dễ rơi vỡ', '金属工具堆叠不稳 / 易倾倒', 'Tools stacked unstably on shelf', '2S', 1, TRUE, TRUE),
('unorganized_molds', 'Khuôn ép, cối dập không ghi mã vị trí kệ', '模具未标明架号与库位', 'Molds & dies missing rack location code', '2S', 1, TRUE, TRUE),
('loose_reels_feeder', 'Cuộn linh kiện SMT để ngổn ngang cạnh Feeder', 'SMT飞达旁料盘杂乱堆放', 'Loose component reels scattered by feeder', '2S', 1, TRUE, TRUE),
('missing_lot_card', 'Lô hàng thiếu thẻ định danh thông tin (Kanban)', '物料缺少流转卡 / 标识单', 'Material lot missing traveler / Kanban card', '2S', 1, TRUE, TRUE),
('disorganized_test_leads', 'Dây que đo thiết bị thử nghiệm quấn lộn xộn', '测试线/探针缠绕未收纳', 'Test leads & probes tangled & unorganized', '2S', 1, TRUE, TRUE),
('hanging_tools_no_retractor', 'Dụng cụ treo thiếu pa-lăng lò xo tự thu', '悬挂气批无平衡器 / 拖地', 'Hanging driver missing spring retractor', '2S', 1, TRUE, TRUE),
('no_sample_board', 'Khu vực sản xuất thiếu bảng mẫu chuẩn OK/NG', '工位无 OK/NG 限度样本看板', 'Station missing OK/NG limit sample board', '2S', 1, TRUE, TRUE),
('overcrowded_staging_area', 'Khu vực đệm (Staging) quá tải, tràn vạch', '暂存区超量容纳 / 溢出标线', 'Overcrowded staging buffer area', '2S', 1, TRUE, TRUE),
('cart_handle_obstructing', 'Tay kéo xe đẩy hàng chĩa ra lối đi', '手推车拉杆凸出走道', 'Cart pull-handle protruding into walkway', '2S', 1, TRUE, TRUE),

-- ============================================================================
-- 3S: SẠCH SẼ (SEISO) - Vệ sinh chuyên sâu, bụi mịn, dầu mỡ, ẩm mốc
-- ============================================================================
('air_vent_filter_clogged', 'Màng lọc quạt hút / Máy lạnh bám đầy bụi', '排气扇/空调滤网严重堵塞', 'Air exhaust / HVAC filter clogged with dirt', '3S', 1, TRUE, TRUE),
('motor_cooling_fin_dirty', 'Cánh tản nhiệt motor máy bám cặn dầu bụi', '电机散热片积满油垢灰尘', 'Motor cooling fins clogged with oily sludge', '3S', 1, TRUE, TRUE),
('dirty_camera_sensors', 'Cảm biến quang / Camera kiểm tra dính bụi mờ', '光电传感器/检测镜头沾污', 'Optical sensor / Inspection camera lens smudged', '3S', 1, TRUE, TRUE),
('chemical_scale_build_up', 'Cặn hóa chất kết tủa đóng mảng quanh bồn', '清洗槽边缘析出化学结晶', 'Chemical crust & scale built up around tank', '3S', 1, TRUE, TRUE),
('moldy_ceiling_walls', 'Trần xưởng / Vách tường ẩm mốc loang lổ', '车间吊顶/墙壁受潮发霉', 'Moldy or water-damaged ceiling & walls', '3S', 1, TRUE, TRUE),
('slippery_stair_treads', 'Bậc cầu thang dính dầu nhớt trơn trợt', '楼梯踏步积油 / 极滑', 'Oily and slippery staircase treads', '3S', 1, TRUE, TRUE),
('conveyor_belt_debris', 'Băng chuyền dính keo bẩn, mạt phôi kẹt khe', '输送带积胶 / 夹缝残留残渣', 'Conveyor belt gummed up with adhesive/debris', '3S', 1, TRUE, TRUE),
('dirty_antistatic_mat', 'Thảm chống tĩnh điện ESD dính bẩn mất dẫn', '防静电皮桌垫脏污积垢', 'ESD antistatic bench mat soiled', '3S', 1, TRUE, TRUE),
('exhaust_duct_leak', 'Ống hút khói hàn / Hút bụi bị rách hở', '排烟管/除尘风管破裂漏灰', 'Exhaust fume / Dust duct leaking or torn', '3S', 1, TRUE, TRUE),
('toilet_cleanliness_issue', 'Nhà vệ sinh xưởng bẩn, thiếu xà phòng', '车间洗手间脏污 / 缺洗手液', 'Workshop restroom unclean / Missing soap', '3S', 1, TRUE, TRUE),
('dirty_forklift_wheels', 'Bánh xe nâng bám đầy chỉ quấn / Băng keo dính', '叉车轮缠绕线头胶带 / 积黑', 'Forklift wheels wrapped in thread/tape debris', '3S', 1, TRUE, TRUE),
('rust_on_compressed_air_pipe', 'Đường ống khí nén rỉ sét, đọng nước van xả', '气路管道锈蚀 / 排水阀积污', 'Compressed air line rusted / Drain valve fouled', '3S', 1, TRUE, TRUE),
('coolant_fluid_odor', 'Dầu làm mát máy CNC ôi thiu bốc mùi lạ', '切削液发臭变质 / 未更换', 'CNC cutting fluid rancid with foul odor', '3S', 1, TRUE, TRUE),
('screen_monitor_smudged', 'Màn hình cảm ứng máy HMI bám dầu ngón tay', 'HMI触控屏严重油污 / 影响可视', 'HMI machine touch screen heavily smudged', '3S', 1, TRUE, TRUE),
('stained_curtain_strip', 'Rèm nhựa chắn bụi cửa xưởng rách bẩn', '防尘PVC软门帘变黑破损', 'PVC dust curtain strips blackened or torn', '3S', 1, TRUE, TRUE),

-- ============================================================================
-- 4S: SĂN SÓC (SEIKETSU) - Duy trì tiêu chuẩn trực quan, nhãn mác, quy chuẩn
-- ============================================================================
('missing_rotation_arrow', 'Thiếu mũi tên chỉ chiều quay motor / Trục cuốn', '电机/主轴缺少旋转方向箭头', 'Missing rotation direction arrow on shaft/motor', '4S', 1, TRUE, TRUE),
('missing_oil_level_gauge', 'Mắt thăm dầu mờ không thấy vạch Min/Max', '油位视窗模糊 / 缺失上下限标线', 'Sight glass opaque / Missing Min-Max oil mark', '4S', 1, TRUE, TRUE),
('outdated_lubrication_chart', 'Biểu đồ bôi trơn máy móc hết hạn định kỳ', '设备润滑卡未按期签核 / 过期', 'Equipment lubrication log outdated', '4S', 1, TRUE, TRUE),
('unlabeled_circuit_breaker', 'Aptomat trong tủ điện không ghi rõ phụ tải', '配电箱空开/断路器无回路标识', 'Circuit breakers lacking load circuit label', '4S', 1, TRUE, TRUE),
('peeling_floor_demarcation', 'Băng keo dán vạch sàn bong tróc nham nhở', '地面定位胶带翘起 / 破损脱落', 'Floor tape demarcation peeling off', '4S', 1, TRUE, TRUE),
('missing_daily_checksheet', 'Máy hoạt động thiếu phiếu bảo dưỡng ngày', '设备无当日点检表 / 漏打勾', 'Missing daily machine maintenance checklist', '4S', 1, TRUE, TRUE),
('missing_esd_ground_tag', 'Dây tiếp địa chống tĩnh điện thiếu tem kiểm tra', '静电接地线无定期检测合格标签', 'ESD grounding wire missing valid test tag', '4S', 1, TRUE, TRUE),
('faded_safety_sign', 'Biển cảnh báo an toàn mờ nhạt rách góc', '安全警示标识脱色 / 翘角破损', 'Faded or torn safety warning signage', '4S', 1, TRUE, TRUE),
('unapproved_temporary_wiring', 'Đấu nối điện tạm bợ không qua phê duyệt', '私拉乱接电线 / 临时线超期', 'Unapproved temporary electrical hookup', '4S', 1, TRUE, TRUE),
('missing_air_pressure_range', 'Đồng hồ khí nén không dán dải áp suất xanh-đỏ', '气压表未贴绿色正常范围标贴', 'Air gauge lacking green-red normal range zone', '4S', 1, TRUE, TRUE),
('damaged_torque_seal', 'Vạch sơn niêm phong ốc vít bị phá không báo', '紧固螺栓扭矩防松标记损坏', 'Bolt torque seal mark broken without report', '4S', 1, TRUE, TRUE),
('missing_weight_capacity_label', 'Kệ hàng, gác lửng không ghi tải trọng tối đa', '货架/阁楼未标明最大承重限额', 'Storage rack missing safe working load label', '4S', 1, TRUE, TRUE),
('improper_color_coding', 'Dùng sai màu dây / Màu cờ theo quy chuẩn 6S', '混用非标准颜色标识 / 违规', 'Improper color-coding non-compliant with standard', '4S', 1, TRUE, TRUE),
('missing_operator_matrix', 'Bảng ma trận kỹ năng thao tác máy trống', '岗位多能工技能矩阵未上墙', 'Operator skill qualification matrix missing', '4S', 1, TRUE, TRUE),
('unauthorized_modifications', 'Tự ý chế thêm móc treo, giá đỡ không chuẩn hóa', '私自焊接安装非标挂钩支架', 'Unauthorized DIY rack or bracket modifications', '4S', 1, TRUE, TRUE),

-- ============================================================================
-- 5S: SẴN SÀNG (SHITSUKE) - Kỷ luật, thói quen tác phong công nghiệp
-- ============================================================================
('unbuttoned_uniform', 'Không mặc đúng đồng phục / Giày bạt đi vào xưởng', '未规范穿戴厂服 / 穿拖鞋入内', 'Improper uniform / Open footwear in factory', '5S', 1, TRUE, TRUE),
('sitting_on_goods_pallets', 'Ngồi lên thùng hàng / Pallet sản phẩm', '坐在货物/托盘上休息', 'Sitting on product cartons or pallets', '5S', 1, TRUE, TRUE),
('leaving_machine_running', 'Rời vị trí nhưng không tắt máy / Nén khí chạy không', '离岗未关机 / 空压设备空转', 'Leaving machine running while unattended', '5S', 1, TRUE, TRUE),
('tailgating_cleanroom_door', 'Vào phòng sạch đi chung cửa không qua Air Shower', '进洁净室尾随进门 / 逃避风淋', 'Bypassing cleanroom air shower / Tailgating', '5S', 1, TRUE, TRUE),
('unlogged_scrap_disposal', 'Vứt phế phẩm không ghi vào sổ phế liệu', '报废不良品未登记乱扔', 'Discarding scrap without logging defect record', '5S', 1, TRUE, TRUE),
('cluttered_personal_belongings', 'Để túi xách, áo khoác bừa bãi tại máy', '工位私人物品/水杯外衣乱放', 'Personal belongings/bags cluttered at workstation', '5S', 1, TRUE, TRUE),
('failing_to_report_defects', 'Phát hiện lỗi bất thường nhưng ỉm đi không báo', '发现异常隐瞒不报 / 漏检放行', 'Failing to report abnormal defects / Concealing', '5S', 1, TRUE, TRUE),
('unauthorized_bystanders', 'Tụ tập nói chuyện riêng gây cản trở thao tác', '聚集闲聊 / 妨碍通道作业', 'Loitering & congregating in production aisle', '5S', 1, TRUE, TRUE),
('leaving_lights_running', 'Hết ca không tắt đèn xưởng / Quạt thông gió', '下班未随手关灯 / 排风扇长开', 'Leaving lights or fans on after shift end', '5S', 1, TRUE, TRUE),
('improper_handover_shift', 'Giao ca không ký bàn giao sổ theo dõi máy', '交接班未口头沟通/记录空白', 'Improper shift handover without record sign-off', '5S', 1, TRUE, TRUE),
('touching_pcb_without_esd', 'Dùng tay trần chạm bo mạch không đeo găng ESD', '徒手触摸PCB敏感器件 / 缺防静电', 'Handling PCB with bare hands without ESD gloves', '5S', 1, TRUE, TRUE),
('smoking_in_unauthorized_zone', 'Hút thuốc trong khu vực cấm / Cầu thang thoát hiểm', '非吸烟区吸烟 / 楼道有烟蒂', 'Smoking in unauthorized area / Stairwell', '5S', 1, TRUE, TRUE),
('overriding_interlock_system', 'Chèn nêm khóa công tắc hành trình an toàn', '短接安全门互锁开关 / 垫塞', 'Overriding safety interlock switch with wedge', '5S', 1, TRUE, TRUE),
('improper_hazardous_waste', 'Đổ hóa chất thừa vào cống thoát nước sinh hoạt', '废液直排下水道 / 违规倾倒', 'Dumping chemical waste into regular sewer drain', '5S', 1, TRUE, TRUE),
('failing_to_sweep_at_shift_end', 'Hết giờ không quét dọn vệ sinh máy theo quy định', '下班前未按5分钟6S要求清扫', 'Failing to perform 5-minute end-of-shift 6S sweep', '5S', 1, TRUE, TRUE),

-- ============================================================================
-- 6S: AN TOÀN (SAFETY) - Rủi ro tai nạn, cháy nổ, máy móc nguy hiểm
-- ============================================================================
('broken_emergency_light', 'Đèn chiếu sáng sự cố mất điện không sáng', '应急照明灯损坏 / 停电不亮', 'Emergency lighting fixture defective / Battery dead', '6S', 1, TRUE, TRUE),
('missing_anti_fall_lanyard', 'Làm việc trên cao không móc dây an toàn', '高空作业未系安全带/无挂钩', 'Working at height without safety harness lanyard', '6S', 1, TRUE, TRUE),
('forklift_mast_obstruction', 'Xe nâng chở hàng cao chắn tầm nhìn phía trước', '叉车盲视驾驶 / 货物超高挡视线', 'Forklift loaded too high obstructing forward view', '6S', 1, TRUE, TRUE),
('uninspected_overhead_crane', 'Dây cáp cẩu trục sờn tưa đứt sợi nguy hiểm', '行车钢丝绳断丝起毛 / 吊钩缺防脱', 'Overhead crane wire rope frayed / Latch missing', '6S', 1, TRUE, TRUE),
('blocked_eyewash_station', 'Vật cản che khuất bồn rửa mắt khẩn cấp', '紧急洗眼器受阻 / 水压不足', 'Emergency eyewash station obstructed / Low pressure', '6S', 1, TRUE, TRUE),
('open_pit_no_barricade', 'Hố ga, rãnh bảo dưỡng mở nắp không rào chắn', '地坑/检修沟盖板缺失且无警示围栏', 'Open maintenance trench/pit lacking safety barrier', '6S', 1, TRUE, TRUE),
('unlabeled_chemical_bottle', 'Chai lọ hóa chất chiết lẻ không nhãn GHS/MSDS', '分装化学品瓶身无危险警告标识', 'Decanted chemical container lacking GHS safety tag', '6S', 1, TRUE, TRUE),
('press_machine_curtain_muted', 'Màn chắn quang an toàn máy dập bị tắt bypass', '冲床红外保护光幕被关闭/短路', 'Press machine optical safety light curtain bypassed', '6S', 1, TRUE, TRUE),
('damaged_insulation_pliers', 'Kìm điện, găng cách điện thủng rách nguy hiểm', '电工绝缘手套破损 / 绝缘工具破皮', 'Insulated electrical gloves torn / Tool insulation split', '6S', 1, TRUE, TRUE),
('unsecured_stacker_charging', 'Trạm sạc ắc-quy xe nâng không có quạt thông gió', '叉车蓄电池充电间未通风 / 积氢隐患', 'Battery charging area lacking hydrogen exhaust fan', '6S', 1, TRUE, TRUE),
('improper_flammable_storage', 'Dung môi dễ cháy để gần nguồn nhiệt / Motor nóng', '易燃溶剂靠近发热源 / 高温电机', 'Flammable solvent stored near heat source/motor', '6S', 1, TRUE, TRUE),
('blocked_fire_hose_reel', 'Cuộn vòi cứu hỏa bị hàng hóa đè ép khó lấy', '消防水带箱被物料挤占无法打开', 'Fire hose cabinet blocked by material boxes', '6S', 1, TRUE, TRUE),
('loose_grinder_guard', 'Máy mài hai đá mất tấm chắn tia lửa / Khe hở lớn', '砂轮机防护罩松动 / 缺少挡屑板', 'Bench grinder missing spark shield / Work rest loose', '6S', 1, TRUE, TRUE),
('dangling_objects_overhead', 'Vật nặng để trên nóc tủ máy có nguy cơ rơi', '设备顶部放置重物 / 坠落砸伤隐患', 'Heavy objects placed loosely on top of equipment', '6S', 1, TRUE, TRUE),
('missing_grounding_rod', 'Bồn chứa dung môi dễ cháy thiếu kẹp tiếp địa tĩnh', '易燃溶剂卸料未夹静电接地夹', 'Flammable solvent drum missing anti-static clamp', '6S', 1, TRUE, TRUE)
ON CONFLICT (code) DO UPDATE SET
    name_vi = EXCLUDED.name_vi,
    name_zh = EXCLUDED.name_zh,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category,
    is_preset = EXCLUDED.is_preset,
    is_active = EXCLUDED.is_active;
