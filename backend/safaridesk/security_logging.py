from __future__ import annotations

import logging


class WebhookQueryRedactionFilter(logging.Filter):
    """Strip query strings from Africa's Talking callback access logs.

    Callback URLs carry the shared webhook token as a query parameter because
    the provider cannot add a custom authentication header. Never write that
    credential to local Uvicorn logs.
    """

    _CALLBACK_PATHS = (
        "/ussd",
        "/webhook/incoming",
        "/api/webhooks/africastalking/",
    )

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if not isinstance(args, tuple) or len(args) < 3 or not isinstance(args[2], str):
            return True
        request_target = args[2]
        if "?" not in request_target:
            return True
        path = request_target.partition("?")[0]
        if path in self._CALLBACK_PATHS[:2] or path.startswith(self._CALLBACK_PATHS[2]):
            record.args = (*args[:2], path, *args[3:])
        return True
