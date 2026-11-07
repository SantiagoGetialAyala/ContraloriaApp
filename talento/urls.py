from django.urls import path
from core import views
urlpatterns = [
    path('', views.dashboard, name='dashboard'),
    path('configurar/', views.setup, name='setup'),
    path('ingresar/', views.sign_in, name='login'),
    path('salir/', views.sign_out, name='logout'),
    path('cuenta/clave/', views.password_change, name='password_change'),
    path('modulos/<str:kind>/', views.case_list, name='case_list'),
    path('modulos/<str:kind>/nuevo/', views.case_create, name='case_create'),
    path('modulos/<str:kind>/reporte/', views.report, name='report'),
    path('compensatorios/calendario/', views.compensatory_calendar, name='compensatory_calendar'),
    path('expedientes/<uuid:case_id>/', views.case_detail, name='case_detail'),
    path('expedientes/<uuid:case_id>/guardar/', views.case_save, name='case_save'),
    path('expedientes/<uuid:case_id>/actuar/', views.case_decision, name='case_decision'),
    path('expedientes/<uuid:case_id>/documentos/', views.case_upload, name='case_upload'),
    path('expedientes/<uuid:case_id>/movimientos/', views.case_payment, name='case_payment'),
    path('expedientes/<uuid:case_id>/reconocimiento/', views.case_recognition, name='case_recognition'),
    path('expedientes/<uuid:case_id>/novedad-vacaciones/', views.case_vacation_interruption, name='case_vacation_interruption'),
    path('documentos/<int:document_id>/ver/', views.document_download, {'preview': True}, name='document_preview'),
    path('documentos/<int:document_id>/descargar/', views.document_download, name='document_download'),
    path('administracion/usuarios/', views.users, name='users'),
    path('administracion/usuarios/<int:user_id>/', views.user_access, name='user_access'),
    path('administracion/auditoria/', views.audit_log, name='audit'),
    path('parametros/', views.configuration, name='configuration'),
    path('procedimientos/', views.procedure, name='procedure'),
]
handler403 = views.forbidden
handler404 = views.not_found
