-- Add 6S tags for office areas and shared workplace spaces.
INSERT INTO tags (code, name_vi, name_zh, name_en, category, use_count, is_preset) VALUES
('office_document_clutter', 'Hồ sơ, tài liệu để lộn xộn hoặc chất đống', '文件资料杂乱堆放', 'Office documents cluttered or piled up', '1S', 1, TRUE),
('obsolete_office_supplies', 'Văn phòng phẩm, thiết bị cũ không còn sử dụng', '闲置或过期办公用品', 'Obsolete or unused office supplies', '1S', 1, TRUE),
('office_desk_disorder', 'Bàn làm việc bừa bộn, vật dụng không theo quy định', '办公桌杂乱、物品未按规定摆放', 'Disorganized office desk', '2S', 1, TRUE),
('office_cable_clutter', 'Dây điện, dây mạng dưới bàn rối và không được cố định', '办公桌下电源线、网线杂乱未固定', 'Tangled or unsecured office cables', '2S', 1, TRUE),
('shared_area_items_misplaced', 'Đồ dùng khu vực chung để sai vị trí', '公共区域物品未归位', 'Shared-area items misplaced', '2S', 1, TRUE),
('office_dust_accumulation', 'Bụi bẩn tích tụ trên bàn, tủ hoặc thiết bị văn phòng', '办公桌、柜子或设备积尘', 'Dust accumulation on office surfaces or equipment', '3S', 1, TRUE),
('office_waste_overflow', 'Thùng rác văn phòng đầy tràn hoặc không phân loại', '办公室垃圾桶溢出或未分类', 'Office waste bin overflowing or unsorted', '3S', 1, TRUE),
('pantry_cleanliness_issue', 'Khu vực pantry, bồn rửa hoặc tủ lạnh chung không sạch', '茶水间、水槽或公共冰箱不洁', 'Pantry, sink, or shared refrigerator unclean', '3S', 1, TRUE),
('missing_office_visual_standard', 'Thiếu hoặc mờ nhãn, sơ đồ, hướng dẫn tại văn phòng', '办公室缺少或模糊的标签、布局图或指引', 'Missing or faded office labels, layout, or instructions', '4S', 1, TRUE),
('unorganized_shared_documents', 'Tài liệu dùng chung không có quy ước lưu trữ hoặc phân loại', '共享文件缺少统一存放和分类规则', 'Shared documents lack a standard filing system', '4S', 1, TRUE),
('improper_office_waste_sorting', 'Không tuân thủ quy định phân loại rác văn phòng', '未遵守办公室垃圾分类规定', 'Office waste sorting non-compliance', '5S', 1, TRUE),
('blocked_office_exit', 'Thùng hàng, đồ dùng chắn lối thoát hiểm văn phòng', '箱子或物品堵塞办公室疏散通道', 'Office exit or evacuation route blocked', '6S', 1, TRUE),
('office_trip_hazard', 'Dây hoặc vật dụng trên sàn tạo nguy cơ vấp ngã', '地面线缆或物品造成绊倒风险', 'Floor cable or object creating a trip hazard', '6S', 1, TRUE),
('overloaded_office_socket', 'Ổ cắm văn phòng cắm quá tải hoặc có dấu hiệu cháy xém', '办公室插座过载或有烧焦痕迹', 'Overloaded or scorched office electrical outlet', '6S', 1, TRUE)
ON CONFLICT (code) DO UPDATE SET
    name_vi = EXCLUDED.name_vi,
    name_zh = EXCLUDED.name_zh,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category,
    is_preset = EXCLUDED.is_preset;
