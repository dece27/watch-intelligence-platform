alter table if exists public.ai_usage_logs
  drop constraint if exists ai_usage_logs_call_type_check;

update public.ai_usage_logs
set call_type = 'identify'
where call_type = 'identifier';

alter table if exists public.ai_usage_logs
  add constraint ai_usage_logs_call_type_check
  check (call_type in (
    'signal',
    'chat',
    'identify',
    'deal_assessment',
    'deal_ranking',
    'what_if',
    'appraisal_text',
    'news_relevance',
    'rebalancing'
  ));
