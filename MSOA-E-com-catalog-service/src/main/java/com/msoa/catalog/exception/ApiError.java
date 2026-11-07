package com.msoa.catalog.exception;

public record ApiError(int status, String error, String message) {
}
