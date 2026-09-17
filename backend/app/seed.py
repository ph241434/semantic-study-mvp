from datetime import datetime, timezone

from sqlalchemy.orm import Session

from . import models


def seed_database(db: Session) -> None:
    if db.query(models.Concept).count() > 0:
        return

    now = datetime.now(timezone.utc)

    # Componential/semantic concepts only. Broad organizational categories (Cybersecurity,
    # Encryption, Cryptography, Authentication, Network Security, ...) live purely in the
    # KnowledgeEntry filesystem tree below, not as Concept rows -- the filesystem hierarchy and
    # the semantic graph are deliberately separate data models.
    concept_rows = [
        ("Symmetric Encryption", "Encryption that uses the same key for both encrypting and decrypting data.", "concept"),
        ("Asymmetric Encryption", "Encryption that uses a mathematically linked public and private key pair.", "concept"),
        ("Hashing", "A one-way transformation that maps data to a fixed-size digest, used to verify integrity.", "concept"),
        ("Keys", "Secret or paired values that control how encryption and decryption transform data.", "concept"),
        ("Algorithm", "A precise sequence of steps a cryptographic system follows to transform data.", "definition"),
        ("Plaintext", "Readable data before it has been encrypted.", "definition"),
        ("Ciphertext", "Encrypted data produced by applying an encryption algorithm to plaintext.", "definition"),
        ("Public Key", "The publicly shareable half of an asymmetric key pair, used to encrypt data or verify signatures.", "definition"),
        ("Private Key", "The secret half of an asymmetric key pair, used to decrypt data or create signatures.", "definition"),
        ("Key Pair", "A mathematically linked public and private key generated together for asymmetric cryptography.", "definition"),
        ("Digital Signatures", "A cryptographic proof, created with a private key, that verifies authenticity and integrity.", "mechanism"),
        ("Certificates", "Digitally signed documents that bind a public key to a verified identity.", "concept"),
        ("PKI", "Public Key Infrastructure: the roles, policies, and systems that manage certificates and public keys.", "concept"),
        ("AES", "Advanced Encryption Standard: a widely used symmetric block cipher.", "algorithm"),
        ("RSA", "A widely used asymmetric algorithm based on the difficulty of factoring large numbers.", "algorithm"),
        ("Dijkstra's Algorithm", "Finds shortest paths from a source node in a weighted graph with nonnegative edge weights.", "algorithm"),
        ("Breadth-First Search", "Traverses a graph level by level, visiting all neighbors before moving deeper.", "algorithm"),
        ("Depth-First Search", "Traverses a graph by exploring as far as possible along each branch before backtracking.", "algorithm"),
        ("Bellman-Ford", "Finds shortest paths from a source node, tolerating negative edge weights.", "algorithm"),
        ("Firewalls", "A system that monitors and filters network traffic based on security rules.", "mechanism"),
        ("Multi-Factor Authentication", "Verifying identity using two or more independent evidence factors.", "mechanism"),
    ]

    concepts: dict[str, models.Concept] = {}
    for name, description, concept_type in concept_rows:
        concept = models.Concept(
            name=name,
            description=description,
            concept_type=concept_type,
            next_review_at=now,
        )
        db.add(concept)
        concepts[name] = concept
    db.flush()

    relationship_rows = [
        ("Symmetric Encryption", "USES", "Keys", "Symmetric encryption uses one shared key for both directions."),
        ("AES", "EXAMPLE_OF", "Symmetric Encryption", "AES is a widely deployed symmetric block cipher."),
        ("Asymmetric Encryption", "USES", "Public Key", "The public key encrypts data or verifies signatures."),
        ("Asymmetric Encryption", "USES", "Private Key", "The private key decrypts data or creates signatures."),
        ("Asymmetric Encryption", "PRODUCES", "Ciphertext", "Encrypting plaintext with the algorithm yields ciphertext."),
        ("Asymmetric Encryption", "REQUIRES", "Key Pair", "Asymmetric encryption depends on a linked public/private key pair."),
        ("Asymmetric Encryption", "RELATED_TO", "Digital Signatures", "The same key pair mechanics underpin digital signatures."),
        ("RSA", "EXAMPLE_OF", "Asymmetric Encryption", "RSA is a widely used asymmetric algorithm."),
        ("Keys", "CONTAINS", "Public Key", "A public key is one type of cryptographic key."),
        ("Keys", "CONTAINS", "Private Key", "A private key is one type of cryptographic key."),
        ("Keys", "CONTAINS", "Key Pair", "A key pair bundles a public and private key together."),
        ("Key Pair", "CONTAINS", "Public Key", "A key pair includes a public key half."),
        ("Key Pair", "CONTAINS", "Private Key", "A key pair includes a private key half."),
        ("Certificates", "CONTAINS", "Public Key", "A certificate binds a public key to a verified identity."),
        ("Public Key", "PART_OF", "PKI", "Public keys are managed within a public key infrastructure."),
        ("Public Key", "RELATED_TO", "Digital Signatures", "Public keys are used to verify digital signatures."),
        ("Digital Signatures", "REQUIRES", "Private Key", "Creating a signature requires the signer's private key."),
        ("Certificates", "USES", "Digital Signatures", "A certificate authority signs certificates with its own key."),
        ("PKI", "CONTAINS", "Certificates", "PKI issues and manages digital certificates."),
        ("Public Key", "ENCRYPTS", "Ciphertext", "The public key encrypts plaintext into ciphertext that only the paired private key can decrypt."),
        ("Private Key", "DECRYPTS", "Ciphertext", "The private key decrypts ciphertext back into the original plaintext."),
    ]

    for source, rel_type, target, description in relationship_rows:
        db.add(
            models.Relationship(
                source_concept_id=concepts[source].id,
                target_concept_id=concepts[target].id,
                relationship_type=rel_type,
                description=description,
                next_review_at=now,
            )
        )
    db.flush()

    _seed_knowledge_tree(db, concepts)

    db.commit()


def _seed_knowledge_tree(db: Session, concepts: dict[str, models.Concept]) -> None:
    def add_folder(parent_id: int | None, name: str, sort_order: int) -> models.KnowledgeEntry:
        entry = models.KnowledgeEntry(parent_id=parent_id, name=name, entry_type="folder", sort_order=sort_order)
        db.add(entry)
        db.flush()
        return entry

    def add_concept_file(parent_id: int, name: str, concept_name: str, sort_order: int) -> models.KnowledgeEntry:
        entry = models.KnowledgeEntry(
            parent_id=parent_id,
            name=name,
            entry_type="concept",
            concept_id=concepts[concept_name].id,
            sort_order=sort_order,
        )
        db.add(entry)
        db.flush()
        return entry

    algorithms = add_folder(None, "Algorithms", 0)
    cybersecurity = add_folder(None, "Cybersecurity", 1)
    add_folder(None, "Operating Systems", 2)
    add_folder(None, "Databases", 3)

    add_folder(algorithms.id, "Sorting", 0)
    add_folder(algorithms.id, "Searching", 1)
    graph_algorithms = add_folder(algorithms.id, "Graph Algorithms", 2)
    add_folder(algorithms.id, "Dynamic Programming", 3)

    add_concept_file(graph_algorithms.id, "Dijkstra's Algorithm", "Dijkstra's Algorithm", 0)
    add_concept_file(graph_algorithms.id, "Breadth-First Search", "Breadth-First Search", 1)
    add_concept_file(graph_algorithms.id, "Depth-First Search", "Depth-First Search", 2)
    add_concept_file(graph_algorithms.id, "Bellman-Ford", "Bellman-Ford", 3)

    cryptography = add_folder(cybersecurity.id, "Cryptography", 0)
    network_security = add_folder(cybersecurity.id, "Network Security", 1)
    authentication = add_folder(cybersecurity.id, "Authentication", 2)

    add_concept_file(cryptography.id, "Asymmetric Encryption", "Asymmetric Encryption", 0)
    add_concept_file(cryptography.id, "Symmetric Encryption", "Symmetric Encryption", 1)
    add_concept_file(cryptography.id, "Hashing", "Hashing", 2)
    add_concept_file(cryptography.id, "Digital Signatures", "Digital Signatures", 3)
    add_concept_file(cryptography.id, "Certificates", "Certificates", 4)
    add_concept_file(cryptography.id, "PKI", "PKI", 5)
    add_concept_file(cryptography.id, "Public Key", "Public Key", 6)
    add_concept_file(cryptography.id, "Private Key", "Private Key", 7)

    add_concept_file(network_security.id, "Firewalls", "Firewalls", 0)
    add_concept_file(authentication.id, "Multi-Factor Authentication", "Multi-Factor Authentication", 0)
