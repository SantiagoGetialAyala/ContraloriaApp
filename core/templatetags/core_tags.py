from decimal import Decimal, InvalidOperation
from django import template
register = template.Library()

@register.filter
def money(value):
    try:
        return '$ ' + f'{Decimal(value):,.2f}'.replace(',', '_').replace('.', ',').replace('_', '.')
    except (InvalidOperation, ValueError, TypeError):
        return '$ 0,00'

@register.filter
def lookup(mapping, key):
    return mapping.get(key, key)
