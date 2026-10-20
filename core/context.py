from .workflows import role_names
from .models import ROLES

def navigation(request):
    roles = role_names(request.user)
    return {'nav_admin': 'administrador' in roles, 'nav_authority': 'autoridad' in roles, 'current_roles': [label for key, label in ROLES if key in roles]}
