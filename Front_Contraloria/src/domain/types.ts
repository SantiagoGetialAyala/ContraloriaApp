export type CaseKind = 'incapacidad' | 'viatico' | 'compensatorio' | 'vacaciones';

export interface UserDTO {
  id: number;
  username: string;
  full_name: string;
  department: string;
  employment: string;
  roles: string[];
  role_labels: string[];
  nav_admin: boolean;
  nav_authority: boolean;
  can_configure: boolean;
}

export interface SessionDTO {
  authenticated: boolean;
  needs_setup: boolean;
  user: UserDTO | null;
}

export interface CaseOwnerDTO {
  id: number;
  username: string;
  full_name: string;
  employment: string;
  cedula?: string;
  cargo?: string;
  codigo?: string;
  grado?: string;
  hire_date?: string;
}

export interface CaseTotalsDTO {
  requested: string;
  recognized: string;
  recovered: string;
  pending: string;
  difference: string;
  paid: string;
  returned: string;
  executed: string;
  authorized: string;
  travel_balance: string;
  committed: string;
}

export interface CompensatorySummaryDTO {
  credit: number;
  debit: number;
  balance: number;
  worked: number;
  approved: number;
  requested: number;
}

export interface CaseSummaryDTO {
  id: string;
  kind: CaseKind;
  kind_display: string;
  reference: string;
  owner: CaseOwnerDTO;
  department: string;
  stage: string;
  stage_label: string;
  progress: number;
  overdue: boolean;
  due_at: string | null;
  revision: number;
  policy_version: number;
  policy_confirmed: boolean;
  created_at: string;
  updated_at: string;
  data: Record<string, unknown>;
  totals: CaseTotalsDTO;
  compensatory: CompensatorySummaryDTO | null;
}

export type FieldType =
  | 'date'
  | 'pastdate'
  | 'time'
  | 'money'
  | 'int'
  | 'bool'
  | 'choice'
  | 'scale'
  | 'textarea'
  | 'text';

export interface FieldSchemaDTO {
  key: string;
  label: string;
  type: FieldType;
  choices: Array<[string, string]>;
  value: string | boolean;
}

export interface StepItemDTO {
  key: string;
  label: string;
  done: boolean;
  current: boolean;
  role_labels: string[];
}

export interface EditableStepDTO {
  key: string;
  label: string;
  roles: string[];
  role_labels: string[];
  fields: string[];
  docs: string[];
  due_days?: number | null;
}

export interface DocumentItemDTO {
  id: number;
  category: string;
  label: string;
  name: string;
  size: number;
  sha256: string;
  uploaded_by: string;
  created_at: string;
  preview_url: string;
  download_url: string;
}

export interface FinancialEntryDTO {
  id: number;
  kind: string;
  kind_display: string;
  amount: string;
  paid_on: string;
  reference: string;
  actor: string;
  evidence_id: number;
  download_url: string;
}

export interface LedgerEntryDTO {
  id: number;
  kind: 'credito' | 'debito';
  kind_display: string;
  effective_on: string;
  minutes: number;
  rule_reference: string;
  case_id: string;
  case_reference: string;
  actor: string;
}

export interface VacationPeriodDTO {
  number: number;
  label: string;
  balance: number;
  reserved: number;
  prescribes_on: string;
  prescribed: boolean;
}

export interface VacationLedgerEntryDTO {
  id: number;
  kind: 'disfrute' | 'devolucion' | 'carga_inicial';
  kind_display: string;
  effective_on: string;
  days: number;
  period_label: string;
  actor: string;
}

export interface VacationDetailDTO {
  periods: VacationPeriodDTO[];
  problem: string | null;
  entries: VacationLedgerEntryDTO[];
  can_interrupt: boolean;
  interruption_documents: Array<{ id: number; label: string }>;
}

export interface EventItemDTO {
  id: number;
  action: string;
  actor: string;
  created_at: string;
  before: string;
  after: string;
  note: string;
  details: Record<string, unknown> | null;
}

export interface CaseDetailDTO extends CaseSummaryDTO {
  correction_fields: string;
  can_edit: boolean;
  can_return: boolean;
  can_reject: boolean;
  full_access: boolean;
  treasury_allowed: boolean;
  can_recognize: boolean;
  step: EditableStepDTO | null;
  steps: StepItemDTO[];
  fields_schema: FieldSchemaDTO[];
  required_documents: string[];
  upload_categories: Array<{ key: string; label: string }>;
  documents: DocumentItemDTO[];
  values: Array<{ key: string; label: string; value: string }>;
  financial_entries: FinancialEntryDTO[];
  payment_options: {
    kinds: Array<[string, string]>;
    evidences: Array<{ id: number; category: string; label: string }>;
  } | null;
  recognition_documents: Array<{ id: number; label: string }>;
  ledger_entries: LedgerEntryDTO[];
  vacation: VacationDetailDTO | null;
  events: {
    total: number;
    page: number;
    num_pages: number;
    has_previous: boolean;
    has_next: boolean;
    items: EventItemDTO[];
  };
}

export interface DashboardDTO {
  today: string;
  provisional: boolean;
  task_count: number;
  stats: {
    total: number;
    active: number;
    closed: number;
    review: number;
    overdue: number;
    rejected: number;
    recovered: string;
    pending: string;
    committed: string;
    executed: string;
    payments: string;
    legalizations: number;
    approved_trips: number;
    inc_review: number;
    inc_recoveries: number;
    trip_rejected: number;
    trip_commissions: number;
    trip_paid: number;
    comp_pending: number;
    comp_authorized: number;
    comp_balance: number;
  };
  kinds: Record<CaseKind, { name: string; count: number; closed: number }>;
  tasks: CaseSummaryDTO[];
  recent: CaseSummaryDTO[];
  alerts: Array<{
    case_id: string | null;
    reference: string;
    label: string;
    date: string;
  }>;
}

export interface CaseListDTO {
  kind: CaseKind;
  title: string;
  count: number;
  states: Array<[string, string]>;
  report_url: string;
  page: number;
  num_pages: number;
  has_previous: boolean;
  has_next: boolean;
  cases: CaseSummaryDTO[];
  fields_schema: FieldSchemaDTO[];
}

export interface CalendarDTO {
  today: string;
  own_balance: {
    credit: number;
    debit: number;
    balance: number;
  };
  entries: Array<{
    id: number;
    request_start_date: string;
    request_end_date: string;
    employee: string;
    minutes: number;
    department: string;
    case_id: string;
    case_reference: string;
    actor: string;
    created_at: string;
  }>;
}

export interface ProceduresDTO {
  modules: Array<{
    kind: CaseKind;
    title: string;
    confirmed: boolean;
    version: number | null;
    stages: Array<{
      number: number;
      key: string;
      label: string;
      roles: string[];
      fields: string[];
      docs: string[];
    }>;
  }>;
}

export interface ConfigurationDTO {
  can_approve: boolean;
  kinds: Array<[string, string]>;
  policies: Array<{
    id: number;
    kind: CaseKind;
    kind_display: string;
    version: number;
    confirmed: boolean;
    source: string;
    source_pages: string;
    approval_reference: string;
    config: Record<string, unknown>;
    created_by: string;
    created_at: string;
  }>;
  scales: Array<{
    id: number;
    name: string;
    category: string;
    destination: string;
    valid_from: string;
    valid_until: string;
    overnight_rate: string;
    day_rate: string;
    source: string;
    approval_reference: string;
    approved_by: string;
    created_at: string;
  }>;
}

export interface UsersDirectoryDTO {
  users: Array<{
    id: number;
    username: string;
    full_name: string;
    department: string;
    employment: string;
    employment_display: string;
    cedula: string;
    cargo: string;
    codigo: string;
    grado: string;
    hire_date: string;
    is_jefe: boolean;
    is_active: boolean;
    roles: string[];
  }>;
  available_roles: Array<[string, string]>;
  employments: Array<[string, string]>;
}

export interface VacationScheduleItemDTO {
  id: string;
  case_id: string | null;
  reference: string;
  employee_id: number;
  name: string;
  role: string;
  dept: string;
  start: string;
  end: string;
  return_date: string;
  business_days: number;
  calendar_days: number;
  stage: string;
  stage_label: string;
  status: 'concedida' | 'en_tramite' | 'suspendida' | 'sin_programar';
  period_label: string;
  balance_days: number;
}

export interface VacationEmployeeInfoDTO {
  id: number;
  username: string;
  name: string;
  role: string;
  dept: string;
  employment: string;
  hire_date: string;
  total_balance: number;
  periods: Array<{
    number: number;
    label: string;
    service_from: string;
    service_to: string;
    balance: number;
    reserved: number;
    prescribes_on: string;
    prescribed: boolean;
  }>;
  problem: string | null;
}

export interface VacationDashboardDTO {
  today: string;
  year: number;
  can_manage_all: boolean;
  is_talento: boolean;
  dependencias: string[];
  holidays: Array<{ date: string; name: string }>;
  schedule: VacationScheduleItemDTO[];
  employees: VacationEmployeeInfoDTO[];
  stats: {
    total_cases: number;
    granted_count: number;
    in_progress_count: number;
    own_balance: number;
  };
}

export interface AuditLogDTO {
  page: number;
  num_pages: number;
  has_previous: boolean;
  has_next: boolean;
  events: Array<{
    id: number;
    created_at: string;
    actor: string;
    action: string;
    case_id: string | null;
    case_reference: string;
    result: string;
  }>;
}

export interface EmployeeDocumentDTO {
  id: number;
  category: string;
  category_label: string;
  title: string;
  notes: string;
  name: string;
  content_type: string;
  size: number;
  sha256: string;
  uploaded_by: string;
  created_at: string;
  preview_url: string;
  download_url: string;
}

export interface PersonHojaDeVidaDTO {
  id: number;
  username: string;
  full_name: string;
  department: string;
  employment: string;
  employment_display: string;
  cedula: string;
  cargo: string;
  codigo: string;
  grado: string;
  hire_date: string;
  phone: string;
  institutional_email: string;
  profession: string;
  bio: string;
  is_jefe: boolean;
  is_active: boolean;
  roles: string[];
  role_labels: string[];
  hoja_vida_count: number;
  documents_count: number;
  latest_hoja_vida: EmployeeDocumentDTO | null;
}

export interface HojasDeVidaDirectoryDTO {
  people: PersonHojaDeVidaDTO[];
  dependencias: string[];
  available_roles: Array<[string, string]>;
  employments: Array<[string, string]>;
  document_categories: Array<[string, string]>;
}

export interface HojaDeVidaDetailDTO {
  person: PersonHojaDeVidaDTO;
  documents: EmployeeDocumentDTO[];
  dependencias: string[];
  available_roles: Array<[string, string]>;
  employments: Array<[string, string]>;
  document_categories: Array<[string, string]>;
}
