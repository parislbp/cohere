//! One error type for every command. Serialised to the frontend as `{ kind, message }`
//! so the UI can branch on `kind` and show `message` verbatim.

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Invalid(String),
    #[error("{0}")]
    Conflict(String),
    #[error("{0}")]
    Tex(String),
    #[error("{0}")]
    Other(String),
}

impl AppError {
    pub fn kind(&self) -> &'static str {
        match self {
            AppError::Io(_) => "io",
            AppError::Json(_) => "json",
            AppError::Zip(_) => "zip",
            AppError::NotFound(_) => "not_found",
            AppError::Invalid(_) => "invalid",
            AppError::Conflict(_) => "conflict",
            AppError::Tex(_) => "tex",
            AppError::Other(_) => "other",
        }
    }

    pub fn not_found(what: impl Into<String>) -> Self {
        AppError::NotFound(what.into())
    }

    pub fn invalid(what: impl Into<String>) -> Self {
        AppError::Invalid(what.into())
    }

    pub fn other(what: impl Into<String>) -> Self {
        AppError::Other(what.into())
    }
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
