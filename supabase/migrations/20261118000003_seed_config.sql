-- Configurable system settings. Prices and limits are starting values that
-- administrators can change in the admin dashboard; nothing in code hardcodes them.
insert into public.subscription_plans (id, name, monthly_price_cents, annual_price_cents, currency, sort_order, limits, features)
values
  ('free', 'Free', 0, 0, 'eur', 0,
    '{"recording_minutes":120,"transcription_minutes":120,"ai_requests":60,"document_uploads":5,"exams_generated":3,"storage_mb":500}',
    '["basic_notes","basic_flashcards","limited_quizzes"]'),
  ('plus', 'Plus', 999, 9590, 'eur', 1,
    '{"recording_minutes":900,"transcription_minutes":900,"ai_requests":600,"document_uploads":40,"exams_generated":30,"storage_mb":5000}',
    '["advanced_notes","flashcards","tutor","exams","documents"]'),
  ('premium', 'Premium', 1999, 19190, 'eur', 2,
    '{"recording_minutes":2400,"transcription_minutes":2400,"ai_requests":2000,"document_uploads":150,"exams_generated":120,"storage_mb":20000}',
    '["advanced_notes","flashcards","advanced_tutor","advanced_exams","documents","advanced_analytics","study_plans","exports","priority"]')
on conflict (id) do nothing;

insert into public.app_settings (key, value, description) values
  ('invite_only', 'true', 'Registration requires a valid invitation code'),
  ('referrals_enabled', 'false', 'Allow user-generated referral codes (future feature)'),
  ('ai_provider', '"anthropic"', 'Active AI provider: anthropic | openai'),
  ('stt_provider', '"openai_whisper"', 'Active speech-to-text provider'),
  ('feature_flags', '{"tutor":true,"exams":true,"documents":true,"planner":true,"google_oauth":false}', 'Feature flags')
on conflict (key) do nothing;

insert into public.achievements (id, name_hu, name_en, description_hu, description_en, xp) values
  ('first_recording', 'Első óra', 'First lesson', 'Rögzítetted az első órádat.', 'You recorded your first lesson.', 50),
  ('first_notes', 'Jegyzetelő', 'Note taker', 'Elkészültek az első AI-jegyzeteid.', 'Your first AI notes are ready.', 50),
  ('streak_7', '7 napos sorozat', '7-day streak', '7 egymást követő napon tanultál.', 'You studied 7 days in a row.', 150),
  ('cards_100', '100 kártya', '100 cards', '100 kártyát ismételtél át.', 'You reviewed 100 flashcards.', 100),
  ('exam_ace', 'Hibátlan', 'Flawless', '100%-os eredményt értél el egy próbavizsgán.', 'You scored 100% on a practice exam.', 200)
on conflict (id) do nothing;
