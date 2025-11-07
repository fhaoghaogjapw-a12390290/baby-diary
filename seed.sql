-- テスト用の記録データ
-- みなと1日目（2025年11月7日）
INSERT OR IGNORE INTO entries (entry_date, day_age, person, title, image_url) VALUES 
  ('2025-11-07', 1, 'minato', '誕生しました！', 'https://via.placeholder.com/800x600/FFB6C1/000000?text=Day1+Minato'),
  ('2025-11-07', 1, 'araga', '普通の木曜日', 'https://via.placeholder.com/800x600/87CEEB/000000?text=Day1+Araga'),
  ('2025-11-07', 1, 'ryu', 'ランチは定食屋', 'https://via.placeholder.com/800x600/98FB98/000000?text=Day1+Ryu');

-- みなと2日目（2025年11月8日）
INSERT OR IGNORE INTO entries (entry_date, day_age, person, title, image_url) VALUES 
  ('2025-11-08', 2, 'minato', 'はじめてのお風呂', 'https://via.placeholder.com/800x600/FFB6C1/000000?text=Day2+Minato'),
  ('2025-11-08', 2, 'araga', '金曜の夜は映画', 'https://via.placeholder.com/800x600/87CEEB/000000?text=Day2+Araga'),
  ('2025-11-08', 2, 'ryu', 'プロジェクト納期前', 'https://via.placeholder.com/800x600/98FB98/000000?text=Day2+Ryu');

-- みなと3日目（2025年11月9日）
INSERT OR IGNORE INTO entries (entry_date, day_age, person, title, image_url) VALUES 
  ('2025-11-09', 3, 'minato', 'よく寝た一日', 'https://via.placeholder.com/800x600/FFB6C1/000000?text=Day3+Minato'),
  ('2025-11-09', 3, 'araga', '土曜は掃除デー', 'https://via.placeholder.com/800x600/87CEEB/000000?text=Day3+Araga'),
  ('2025-11-09', 3, 'ryu', 'カフェで読書', 'https://via.placeholder.com/800x600/98FB98/000000?text=Day3+Ryu');
